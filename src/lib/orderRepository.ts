import { orders as fallbackOrders } from "@/data/mockData";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type { BotOrderStatus, Order, OrderSource, OrderStatus, OrderType, PaymentStatus, SalesChannel } from "@/types";

interface OrderNotesPayload {
  notes?: string;
  source?: OrderSource;
  botStatus?: BotOrderStatus;
  designDetails?: string;
  quoteOption?: string;
  referenceImages?: string[];
}

interface OrderRow {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  order_type: OrderType;
  payment_status: PaymentStatus;
  order_status: OrderStatus;
  sales_channel: SalesChannel;
  delivery_method: Order["delivery"] | null;
  total: number | string | null;
  notes: string | null;
  order_items?: OrderItemRow[];
}

interface OrderItemRow {
  product_name: string;
  size: string | null;
  color: string | null;
  quantity: number | null;
  unit_price: number | string | null;
  is_custom: boolean | null;
  custom_description: string | null;
}

function parseNotes(notes: string | null): OrderNotesPayload {
  if (!notes) return {};

  try {
    return JSON.parse(notes) as OrderNotesPayload;
  } catch {
    return { notes };
  }
}

function serializeNotes(order: Order) {
  return JSON.stringify({
    notes: order.notes,
    source: order.source,
    botStatus: order.botStatus,
    designDetails: order.designDetails,
    quoteOption: order.quoteOption,
    referenceImages: order.referenceImages ?? []
  });
}

function normalizeOrderNumber(orderNumber: string | null, id: string) {
  if (orderNumber) return orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
  return `#${id.slice(0, 6).toUpperCase()}`;
}

function rowToOrder(row: OrderRow): Order {
  const notes = parseNotes(row.notes);
  const firstItem = row.order_items?.[0];
  const total = Number(row.total ?? firstItem?.unit_price ?? 0);

  return {
    id: normalizeOrderNumber(row.order_number, row.id),
    customer: row.customer_name,
    customerPhone: row.customer_phone ?? undefined,
    type: row.order_type,
    product: firstItem?.product_name ?? "Pedido",
    size: firstItem?.size ?? undefined,
    color: firstItem?.color ?? undefined,
    payment: row.payment_status,
    status: row.order_status,
    total,
    channel: row.sales_channel,
    prendas: Number(firstItem?.quantity ?? 1),
    delivery: row.delivery_method ?? undefined,
    notes: notes.notes,
    source: notes.source,
    botStatus: notes.botStatus,
    designDetails: notes.designDetails ?? firstItem?.custom_description ?? undefined,
    quoteOption: notes.quoteOption,
    referenceImages: notes.referenceImages ?? []
  };
}

function cleanOrderNumber(id: string) {
  return id.replace(/^#/, "");
}

export async function readOrders(): Promise<Order[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return fallbackOrders;

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(product_name, size, color, quantity, unit_price, is_custom, custom_description)")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Supabase orders read failed.", error.message);
    return fallbackOrders;
  }

  return (data as OrderRow[]).map(rowToOrder);
}

export async function createOrder(order: Order): Promise<Order[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [order, ...fallbackOrders];

  const safeQuantity = Math.max(1, order.prendas || 1);
  const unitPrice = Math.max(0, order.total / safeQuantity);

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: cleanOrderNumber(order.id),
      customer_name: order.customer,
      customer_phone: order.customerPhone,
      order_type: order.type,
      payment_status: order.payment,
      order_status: order.status,
      sales_channel: order.channel,
      delivery_method: order.delivery,
      subtotal: order.total,
      total: order.total,
      notes: serializeNotes(order)
    })
    .select("id")
    .single();

  if (orderError) throw new Error(orderError.message);

  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: orderRow.id,
    product_name: order.product,
    size: order.size,
    color: order.color,
    quantity: safeQuantity,
    unit_price: unitPrice,
    is_custom: order.type === "Personalizada",
    custom_description: order.designDetails
  });

  if (itemError) throw new Error(itemError.message);

  return readOrders();
}

export async function updateOrder(orderId: string, updates: Partial<Order>): Promise<Order[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return fallbackOrders;

  const updatePayload: Record<string, unknown> = {};
  if (updates.payment) updatePayload.payment_status = updates.payment;
  if (updates.status) updatePayload.order_status = updates.status;
  if (updates.delivery) updatePayload.delivery_method = updates.delivery;
  if (updates.notes !== undefined) updatePayload.notes = serializeNotes({ ...updates, id: orderId } as Order);

  if (Object.keys(updatePayload).length) {
    const { error } = await supabase.from("orders").update(updatePayload).eq("order_number", cleanOrderNumber(orderId));
    if (error) throw new Error(error.message);
  }

  return readOrders();
}
