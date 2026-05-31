import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { createOrder, readOrders, updateOrder } from "@/lib/orderRepository";
import {
  RequestSecurityError,
  assertAllowedOrigin,
  assertBodySize,
  assertRateLimit,
  cleanText,
  secureJsonHeaders
} from "@/lib/requestSecurity";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { Order, OrderLineItem } from "@/types";

const referenceBucket = "order-references";
const catalogType = "Cat\u00e1logo" as const;
const maxOrderBodyBytes = 12 * 1024 * 1024;
const maxReferenceFiles = 5;
const maxReferenceFileBytes = 5 * 1024 * 1024;
const orderWindowMs = 2 * 60 * 60 * 1000;
const orderWindowLimit = 5;
const allowedReferenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

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

function firstValueOf(formData: FormData, keys: string[]) {
  for (const key of keys) {
    const value = valueOf(formData, key).trim();
    if (value) return value;
  }

  return "";
}

function numericValue(value: string, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function orderNumber() {
  return `WEB-${Date.now().toString().slice(-8)}`;
}

function parseItems(value: string): OrderLineItem[] {
  if (!value) return [];

  try {
    const items = JSON.parse(value) as OrderLineItem[];
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "").slice(0, 24);
}

function safeQuantity(value: number) {
  return Math.min(Math.max(1, Math.round(value || 1)), 50);
}

function safeMoney(value: number) {
  return Math.min(Math.max(0, Number.isFinite(value) ? value : 0), 50_000);
}

function safeItems(items: OrderLineItem[]): OrderLineItem[] {
  return items.slice(0, 20).map((item) => ({
    ...item,
    productName: cleanText(item.productName, 120) || "Prenda",
    color: cleanText(item.color, 60) || undefined,
    size: cleanText(item.size, 20) || undefined,
    quantity: safeQuantity(Number(item.quantity)),
    unitPrice: safeMoney(Number(item.unitPrice)),
    lineTotal: safeMoney(Number(item.lineTotal)),
    description: cleanText(item.description, 300) || undefined
  }));
}

function validateOrderForSales(order: Order) {
  const items = order.items?.length
    ? order.items
    : [
        {
          productName: order.product,
          color: order.color,
          size: order.size,
          quantity: order.prendas,
          unitPrice: order.total,
          lineTotal: order.total
        }
      ];
  const totalQuantity = items.reduce((sum, item) => sum + Math.max(1, Number(item.quantity || 1)), 0);

  if (totalQuantity > 20) {
    throw new RequestSecurityError("Puedes pedir maximo 20 prendas por pedido.", 400);
  }

  for (const item of items) {
    if (!item.color || !item.size) {
      throw new RequestSecurityError("Cada prenda debe tener color y talla.", 400);
    }
  }
}

function validReferenceFiles(formData: FormData) {
  const files = formData.getAll("references").filter((value): value is File => value instanceof File && value.size > 0);

  if (files.length > maxReferenceFiles) {
    throw new RequestSecurityError(`Puedes subir hasta ${maxReferenceFiles} imagenes por pedido.`, 413);
  }

  files.forEach((file) => {
    if (file.size > maxReferenceFileBytes) {
      throw new RequestSecurityError("Una imagen supera el tamano permitido.", 413);
    }

    if (file.type && !allowedReferenceTypes.has(file.type)) {
      throw new RequestSecurityError("Solo se permiten imagenes JPG, PNG, WEBP o GIF.", 415);
    }
  });

  return files;
}

async function uploadReferences(formData: FormData, orderId: string) {
  const files = validReferenceFiles(formData);
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
  const type = valueOf(formData, "type") === catalogType ? catalogType : "Personalizada";
  const quantity = safeQuantity(numericValue(valueOf(formData, "quantity"), 1));
  const total = safeMoney(numericValue(valueOf(formData, "total"), 0));
  const references = await uploadReferences(formData, id);
  const items = safeItems(parseItems(valueOf(formData, "items")));
  const designDetails = cleanText(firstValueOf(formData, ["designDetails", "customDetails", "details", "message", "notes"]), 1000);
  const notes = cleanText(firstValueOf(formData, ["notes", "designDetails", "customDetails", "details", "message"]), 1000);
  const product = cleanText(valueOf(formData, "product"), 120) || (type === catalogType ? "Pedido catalogo" : "Polera personalizada");
  const size = cleanText(valueOf(formData, "size"), 20) || undefined;
  const color = cleanText(valueOf(formData, "color"), 60) || undefined;

  return {
    id: `#${id}`,
    customer: cleanText(valueOf(formData, "customer"), 80) || "Cliente web",
    customerPhone: normalizePhone(valueOf(formData, "phone")) || undefined,
    type,
    product,
    size,
    color,
    payment: "Pendiente",
    status: "Esperando pago",
    total,
    channel: "Web",
    prendas: quantity,
    notes: notes || undefined,
    source: type === catalogType ? "Web cat\u00e1logo" : "Web personaliza",
    botStatus: "Esperando comprobante",
    designDetails: designDetails || undefined,
    quoteOption: cleanText(valueOf(formData, "quoteOption"), 120) || undefined,
    referenceImages: references,
    items: items.length
      ? items
      : [
          {
            productName: product,
            size,
            color,
            quantity,
            unitPrice: quantity > 0 ? total / quantity : total,
            lineTotal: total,
            isCustom: type === "Personalizada",
            description: designDetails || undefined
          }
        ]
  };
}

function orderFromJson(payload: Order & Record<string, unknown>): Order {
  const rawItems = Array.isArray(payload.items) ? (payload.items as OrderLineItem[]) : [];
  const designDetails =
    cleanText(
      [payload.designDetails, payload.customDetails, payload.details, payload.message, payload.notes].find(
        (value) => typeof value === "string" && value.trim()
      ),
      1000
    ) || undefined;
  const notes = cleanText([payload.notes, designDetails].find((value) => typeof value === "string" && value.trim()), 1000) || undefined;
  const type = payload.type === catalogType ? catalogType : "Personalizada";

  return {
    ...payload,
    id: cleanText(payload.id, 40) || `#${orderNumber()}`,
    customer: cleanText(payload.customer, 80) || "Cliente web",
    customerPhone: normalizePhone(String(payload.customerPhone ?? payload.phone ?? "")) || undefined,
    type,
    product: cleanText(payload.product, 120) || (type === catalogType ? "Pedido catalogo" : "Polera personalizada"),
    size: cleanText(payload.size, 20) || undefined,
    color: cleanText(payload.color, 60) || undefined,
    total: safeMoney(Number(payload.total)),
    prendas: safeQuantity(Number(payload.prendas)),
    notes,
    designDetails: designDetails ?? payload.designDetails,
    items: safeItems(rawItems).map((item) => ({
      ...item,
      description:
        item.description ??
        (type === "Personalizada" ? designDetails ?? String(payload.quoteOption ?? "Cotizacion por revisar") : undefined)
    }))
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);

    const orders = await readOrders();
    return NextResponse.json(orders, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 401;
    const message = error instanceof Error ? error.message : "No autorizado.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    assertBodySize(request, maxOrderBodyBytes);
    let isAdminSubmission = false;

    if (request.headers.get("authorization")) {
      try {
        await requireAdminRequest(request);
        isAdminSubmission = true;
      } catch {
        isAdminSubmission = false;
      }
    }

    const contentType = request.headers.get("content-type") ?? "";
    let order: Order;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const type = valueOf(formData, "type") === catalogType ? "catalog" : "custom";
      if (!isAdminSubmission) {
        await assertRateLimit(request, { limit: orderWindowLimit, windowMs: orderWindowMs, scope: `orders:${type}` });
      }
      order = await orderFromFormData(formData);
    } else {
      const payload = (await request.json()) as Order & Record<string, unknown>;
      const type = payload.type === catalogType ? "catalog" : "custom";
      if (!isAdminSubmission) {
        await assertRateLimit(request, { limit: orderWindowLimit, windowMs: orderWindowMs, scope: `orders:${type}` });
      }
      order = orderFromJson(payload);
    }

    validateOrderForSales(order);
    const orders = await createOrder(order);
    return NextResponse.json(orders, { status: 201, headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo registrar el pedido.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function PATCH(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const body = (await request.json()) as { id: string; updates: Partial<Order> };
    const orders = await updateOrder(body.id, body.updates);

    return NextResponse.json(orders, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo actualizar el pedido.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
