import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { jsonHeaders } from "@/lib/catalogStore";
import { createSupabaseAdminClient } from "@/lib/supabase";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const productImagesBucket = "product-images";

function safeFileName(name: string) {
  const extension = path.extname(name).toLowerCase() || ".png";
  const baseName = path
    .basename(name, extension)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return `${baseName || "producto"}-${Date.now()}${extension}`;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("image");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Imagen requerida" }, { status: 400, headers: jsonHeaders() });
  }

  if (!allowedTypes.has(file.type)) {
    return NextResponse.json(
      { error: "Formato no permitido. Usa JPG, PNG, WEBP o GIF." },
      { status: 400, headers: jsonHeaders() }
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileName = safeFileName(file.name);
  const supabase = createSupabaseAdminClient();

  if (supabase) {
    const storagePath = `products/${fileName}`;
    let { error } = await supabase.storage.from(productImagesBucket).upload(storagePath, bytes, {
      contentType: file.type,
      upsert: true
    });

    if (error && /bucket|not found|does not exist/i.test(error.message)) {
      await supabase.storage.createBucket(productImagesBucket, { public: true });
      const retry = await supabase.storage.from(productImagesBucket).upload(storagePath, bytes, {
        contentType: file.type,
        upsert: true
      });
      error = retry.error;
    }

    if (error) {
      return NextResponse.json(
        { error: `No se pudo subir la imagen a Supabase: ${error.message}` },
        { status: 500, headers: jsonHeaders() }
      );
    }

    const { data } = supabase.storage.from(productImagesBucket).getPublicUrl(storagePath);
    return NextResponse.json({ imageUrl: data.publicUrl }, { headers: jsonHeaders() });
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  await writeFile(path.join(uploadsDir, fileName), bytes);

  return NextResponse.json({ imageUrl: `/uploads/${fileName}` }, { headers: jsonHeaders() });
}
