import { NextResponse } from "next/server";
import { jsonHeaders } from "@/lib/catalogStore";
import { createOrder, readOrders, updateOrder } from "@/lib/orderRepository";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { Order } from "@/types";

const referenceBucket = "order-references";

async function ensureReferenceBucket() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === referenceBucket);

  if (!exists) {
    await supabase.storage.createBucket(referenceBucket, { public: true });
  }

  return supabase;
}

function valueOf(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function numericValue(value: string, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function orderNumber() {
  return `WEB-${Date.now().toString().slice(-8)}`;
}

async function uploadReferences(formData: FormData, orderId: string) {
  const files = formData.getAll("references").filter((value): value is File => value instanceof File && value.size > 0);
  if (!files.length) return [] as string[];

  const supabase = await ensureReferenceBucket();
  if (!supabase) return files.map((file) => file.name);

  const urls: string[] = [];

  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop() || "png";
    const path = `${orderId}/${Date.now()}-${index}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage.from(referenceBucket).upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true
    });

    if (error) {
      urls.push(file.name);
      continue;
    }

    const { data } = supabase.storage.from(referenceBucket).getPublicUrl(path);
    urls.push(data.publicUrl);
  }

  return urls;
}

async function orderFromFormData(formData: FormData): Promise<Order> {
  const id = orderNumber();
  const type = valueOf(formData, "type") === "Catálogo" ? "Catálogo" : "Personalizada";
  const quantity = numericValue(valueOf(formData, "quantity"), 1);
  const total = numericValue(valueOf(formData, "total"), 0);
  const references = await uploadReferences(formData, id);

  return {
    id: `#${id}`,
    customer: valueOf(formData, "customer") || "Cliente web",
    customerPhone: valueOf(formData, "phone") || undefined,
    type,
    product: valueOf(formData, "product") || (type === "Catálogo" ? "Pedido catálogo" : "Polera personalizada"),
    size: valueOf(formData, "size") || undefined,
    color: valueOf(formData, "color") || undefined,
    payment: "Pendiente",
    status: "Esperando pago",
    total,
    channel: "Web",
    prendas: quantity,
    notes: valueOf(formData, "notes") || undefined,
    source: type === "Catálogo" ? "Web catálogo" : "Web personaliza",
    botStatus: "Esperando comprobante",
    designDetails: valueOf(formData, "designDetails") || undefined,
    quoteOption: valueOf(formData, "quoteOption") || undefined,
    referenceImages: references
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function GET() {
  const orders = await readOrders();
  return NextResponse.json(orders, { headers: jsonHeaders() });
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";
  const order = contentType.includes("multipart/form-data")
    ? await orderFromFormData(await request.formData())
    : ((await request.json()) as Order);

  const orders = await createOrder(order);
  return NextResponse.json(orders, { status: 201, headers: jsonHeaders() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id: string; updates: Partial<Order> };
  const orders = await updateOrder(body.id, body.updates);

  return NextResponse.json(orders, { headers: jsonHeaders() });
}
