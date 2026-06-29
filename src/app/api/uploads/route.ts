import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { optimizeProductImage, ProductImageError } from "@/lib/productImageOptimization";
import { RequestSecurityError, assertAllowedOrigin, assertBodySize, secureJsonHeaders } from "@/lib/requestSecurity";
import { createSupabaseAdminClient } from "@/lib/supabase";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const productImagesBucket = "product-images";
const maxProductImageBytes = 5 * 1024 * 1024;

function safeFileName(name: string) {
  const baseName = path
    .basename(name, path.extname(name))
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${baseName || "producto"}-${Date.now()}.webp`;
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    if (!request.headers.get("content-length")) {
      throw new RequestSecurityError("La carga debe indicar su tamaño.", 411);
    }
    assertBodySize(request, maxProductImageBytes + 1024 * 1024);
    await requireAdminRequest(request);
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 401;
    const message = error instanceof Error ? error.message : "No autorizado.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }

  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Imagen requerida" }, { status: 400, headers: secureJsonHeaders(request) });
  }

  if (!allowedTypes.has(file.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa JPG, PNG, WEBP o GIF." },
      { status: 400, headers: secureJsonHeaders(request) }
    );
  }

  if (file.size > maxProductImageBytes) {
    return NextResponse.json(
      { error: "La imagen no puede superar 5 MB." },
      { status: 413, headers: secureJsonHeaders(request) }
    );
  }

  let bytes: Buffer;
  try {
    bytes = await optimizeProductImage(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    const message =
      error instanceof ProductImageError
        ? error.message
        : "No se pudo procesar la imagen. Intenta con otro archivo.";
    return NextResponse.json({ error: message }, { status: 400, headers: secureJsonHeaders(request) });
  }

  const fileName = safeFileName(file.name);
  const supabase = createSupabaseAdminClient();

  if (supabase) {
    const storagePath = `products/${fileName}`;
    let { error } = await supabase.storage.from(productImagesBucket).upload(storagePath, bytes, {
      contentType: "image/webp",
      upsert: true
    });

    if (error && /bucket|not found|does not exist/i.test(error.message)) {
      await supabase.storage.createBucket(productImagesBucket, { public: true });
      const retry = await supabase.storage.from(productImagesBucket).upload(storagePath, bytes, {
        contentType: "image/webp",
        upsert: true
      });
      error = retry.error;
    }

    if (error) {
      return NextResponse.json(
        { error: `No se pudo subir la imagen a Supabase: ${error.message}` },
        { status: 500, headers: secureJsonHeaders(request) }
      );
    }

    const { data } = supabase.storage.from(productImagesBucket).getPublicUrl(storagePath);
    return NextResponse.json({ imageUrl: data.publicUrl }, { headers: secureJsonHeaders(request) });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, fileName), bytes);

  return NextResponse.json({ imageUrl: `/uploads/${fileName}` }, { headers: secureJsonHeaders(request) });
}
