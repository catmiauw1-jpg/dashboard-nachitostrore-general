import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { OrderNotFoundError, createOrder, readOrders, updateOrder } from "@/lib/orderRepository";
import { CatalogUnavailableError, readPublicCatalogProducts } from "@/lib/productRepository";
import { PublicOrderValidationError, securePublicOrder } from "@/lib/publicOrderSecurity";
import {
  RequestSecurityError,
  assertAllowedOrigin,
  assertBodySize,
  assertRateLimit,
  cleanText,
  secureJsonHeaders
} from "@/lib/requestSecurity";
import { createSupabaseAdminClient } from "@/lib/supabase";
import {
  OrderReferenceValidationError,
  displayOrderReference,
  extractOrderReferencePath,
  sanitizeSubmittedOrderReferences,
  storageOrderReference
} from "@/lib/orderReferenceSecurity";
import type { Order, OrderLineItem } from "@/types";

const referenceBucket = "order-references";
const catalogType = "Cat\u00e1logo" as const;
const maxOrderBodyBytes = 12 * 1024 * 1024;
const maxReferenceFiles = 5;
const maxReferenceFileBytes = 5 * 1024 * 1024;
const orderWindowMs = 2 * 60 * 60 * 1000;
const orderWindowLimit = 5;
const allowedReferenceTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

class OrderUpdateValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderUpdateValidationError";
  }
}

async function ensureReferenceBucket() {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return null;

  const { data: buckets } = await supabase.storage.listBuckets();
  const exists = buckets?.some((bucket) => bucket.id === referenceBucket);

  if (!exists) await supabase.storage.createBucket(referenceBucket, { public: false });
  else await supabase.storage.updateBucket(referenceBucket, { public: false });

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
  return value.replace(/\D/g, "").slice(0, 24);
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

  const references: string[] = [];

  for (const [index, file] of files.entries()) {
    const extension = file.name.split(".").pop() || "png";
    const path = `${orderId}/${Date.now()}-${index}.${extension}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error } = await supabase.storage.from(referenceBucket).upload(path, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true
    });

    if (error) {
      references.push(file.name);
      continue;
    }

    references.push(storageOrderReference(path));
  }

  return references;
}

async function signOrderReferences(orders: Order[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return orders;

  return Promise.all(
    orders.map(async (order) => {
      const referenceImages = await Promise.all(
        (order.referenceImages ?? []).map(async (reference) => {
          try {
            const path = extractOrderReferencePath(reference, supabaseUrl);
            if (!path) return displayOrderReference(reference);
            const { data, error } = await supabase.storage.from(referenceBucket).createSignedUrl(path, 60 * 60);
            return error || !data?.signedUrl ? "Referencia no disponible" : data.signedUrl;
          } catch (error) {
            console.error("Order reference signing failed", { orderId: order.id, error });
            return "Referencia no disponible";
          }
        })
      );
      return { ...order, referenceImages };
    })
  );
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
  const product = cleanText(valueOf(formData, "product"), 120) || (type === catalogType ? "Pedido catálogo" : "Polera personalizada");
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
  const referenceImages = Array.isArray(payload.referenceImages)
    ? sanitizeSubmittedOrderReferences(payload.referenceImages.slice(0, maxReferenceFiles), supabaseUrl)
    : [];

  return {
    id: cleanText(payload.id, 40) || `#${orderNumber()}`,
    customer: cleanText(payload.customer, 80) || "Cliente web",
    customerPhone: normalizePhone(String(payload.customerPhone ?? payload.phone ?? "")) || undefined,
    type,
    product: cleanText(payload.product, 120) || (type === catalogType ? "Pedido catálogo" : "Polera personalizada"),
    size: cleanText(payload.size, 20) || undefined,
    color: cleanText(payload.color, 60) || undefined,
    total: safeMoney(Number(payload.total)),
    prendas: safeQuantity(Number(payload.prendas)),
    payment: payload.payment,
    status: payload.status,
    channel: payload.channel,
    delivery: payload.delivery,
    deliveryArea: payload.deliveryArea,
    deliveryDepartment: cleanText(payload.deliveryDepartment, 80) || undefined,
    notes,
    source: payload.source,
    botStatus: payload.botStatus,
    designDetails,
    quoteOption: cleanText(payload.quoteOption, 120) || undefined,
    referenceImages,
    priority: payload.priority,
    promisedDeliveryDate: cleanText(payload.promisedDeliveryDate, 40) || undefined,
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

    const orders = await signOrderReferences(await readOrders());
    return NextResponse.json(orders, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 500;
    const message = error instanceof RequestSecurityError ? error.message : "No se pudieron cargar los pedidos.";
    if (status >= 500) console.error("Order loading failed", error);
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function POST(request: Request) {
  try {
    assertBodySize(request, maxOrderBodyBytes);
    let isAdminSubmission = false;

    if (request.headers.get("authorization")) {
      await requireAdminRequest(request);
      isAdminSubmission = true;
    }

    if (!isAdminSubmission && !request.headers.get("origin")) {
      throw new RequestSecurityError("Origen requerido.", 403);
    }

    assertAllowedOrigin(request);

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

    if (!isAdminSubmission) {
      const products = await readPublicCatalogProducts({ requireDatabase: true });
      order = securePublicOrder(order, products);
    }

    validateOrderForSales(order);
    const orders = await createOrder(order);
    const response = isAdminSubmission
      ? await signOrderReferences(orders)
      : [orders.find((candidate) => candidate.id === order.id) ?? order].map(({ referenceImages: _references, ...savedOrder }) => savedOrder);
    return NextResponse.json(response, { status: 201, headers: secureJsonHeaders(request) });
  } catch (error) {
    const isInvalidInput =
      error instanceof PublicOrderValidationError || error instanceof OrderReferenceValidationError;
    const status = error instanceof RequestSecurityError
      ? error.status
      : error instanceof CatalogUnavailableError
        ? 503
        : isInvalidInput
          ? 400
          : 500;
    const message =
      error instanceof RequestSecurityError || isInvalidInput
        ? error.message
        : error instanceof CatalogUnavailableError
          ? "El catálogo no está disponible temporalmente. Intenta nuevamente en unos minutos."
          : "No se pudo registrar el pedido.";
    if (status >= 500) console.error("Order creation failed", error);
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function PATCH(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OrderUpdateValidationError("JSON inválido.");
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new OrderUpdateValidationError("Solicitud inválida.");
    }

    const candidate = body as { id?: unknown; updates?: unknown };
    const id = cleanText(candidate.id, 80);
    if (!id) throw new OrderUpdateValidationError("El pedido es obligatorio.");
    if (!candidate.updates || typeof candidate.updates !== "object" || Array.isArray(candidate.updates)) {
      throw new OrderUpdateValidationError("Las actualizaciones son obligatorias.");
    }

    const orders = await signOrderReferences(
      await updateOrder(id, candidate.updates as Partial<Order>, { notifyCustomer: true })
    );

    return NextResponse.json(orders, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError
      ? error.status
      : error instanceof OrderUpdateValidationError
        ? 400
        : error instanceof OrderNotFoundError
          ? 404
          : 500;
    const message =
      error instanceof RequestSecurityError || error instanceof OrderUpdateValidationError || error instanceof OrderNotFoundError
        ? error.message
        : "No se pudo actualizar el pedido.";
    if (status >= 500) console.error("Order update failed", error);
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
