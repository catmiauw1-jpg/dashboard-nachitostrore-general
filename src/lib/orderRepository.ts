import { orders as fallbackOrders } from "@/data/mockData";
import { createSupabaseAdminClient } from "@/lib/supabase";
import type {
  BotOrderStatus,
  Order,
  OrderLineItem,
  OrderSource,
  OrderStatus,
  OrderType,
  PaymentStatus,
  SalesChannel
} from "@/types";

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
  created_at: string | null;
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

function itemRowToOrderLine(item: OrderItemRow): OrderLineItem {
  const quantity = Math.max(1, Number(item.quantity ?? 1));
  const unitPrice = Number(item.unit_price ?? 0);

  return {
    productName: item.product_name,
    size: item.size ?? undefined,
    color: item.color ?? undefined,
    quantity,
    unitPrice,
    lineTotal: quantity * unitPrice,
    isCustom: Boolean(item.is_custom),
    description: item.custom_description ?? undefined
  };
}

function orderItemsForInsert(order: Order) {
  const items = order.items?.length
    ? order.items
    : [
        {
          productName: order.product,
          size: order.size,
          color: order.color,
          quantity: Math.max(1, order.prendas || 1),
          unitPrice: Math.max(0, order.total / Math.max(1, order.prendas || 1)),
          lineTotal: order.total,
          isCustom: order.type === "Personalizada",
          description: order.designDetails
        }
      ];

  return items.map((item) => {
    const quantity = Math.max(1, item.quantity || 1);
    const unitPrice = Math.max(0, item.unitPrice || item.lineTotal / quantity || 0);

    return {
      product_name: item.productName,
      size: item.size,
      color: item.color,
      quantity,
      unit_price: unitPrice,
      is_custom: item.isCustom ?? order.type === "Personalizada",
      custom_description: item.description ?? order.designDetails
    };
  });
}

function rowToOrder(row: OrderRow): Order {
  const notes = parseNotes(row.notes);
  const firstItem = row.order_items?.[0];
  const items = (row.order_items ?? []).map(itemRowToOrderLine);
  const itemsTotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = Number(row.total ?? itemsTotal);
  const prendas = items.reduce((sum, item) => sum + item.quantity, 0) || Number(firstItem?.quantity ?? 1);
  const product =
    items.length > 1
      ? row.order_type === "Catálogo"
        ? "Pedido catálogo"
        : "Polera personalizada"
      : firstItem?.product_name ?? "Pedido";

  return {
    id: normalizeOrderNumber(row.order_number, row.id),
    customer: row.customer_name,
    customerPhone: row.customer_phone ?? undefined,
    createdAt: row.created_at ?? undefined,
    type: row.order_type,
    product,
    size: firstItem?.size ?? undefined,
    color: firstItem?.color ?? undefined,
    payment: row.payment_status,
    status: row.order_status,
    total,
    channel: row.sales_channel,
    prendas,
    delivery: row.delivery_method ?? undefined,
    notes: notes.notes,
    source: notes.source,
    botStatus: notes.botStatus,
    designDetails: notes.designDetails ?? firstItem?.custom_description ?? undefined,
    quoteOption: notes.quoteOption,
    referenceImages: notes.referenceImages ?? [],
    items
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

  const items = orderItemsForInsert(order);
  const total = Math.max(
    0,
    order.total || items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0), 0)
  );

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
      subtotal: total,
      total,
      notes: serializeNotes(order)
    })
    .select("id")
    .single();

  if (orderError) throw new Error(orderError.message);

  const { error: itemError } = await supabase
    .from("order_items")
    .insert(items.map((item) => ({ ...item, order_id: orderRow.id })));

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
