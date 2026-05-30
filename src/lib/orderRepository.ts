import { adjustStockByColorSize, reserveStockByColorSize } from "@/lib/stockRepository";
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
  stockDeducted?: boolean;
  stockDeductedAt?: string;
  stockRestoredAt?: string;
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
    referenceImages: order.referenceImages ?? [],
    stockDeducted: order.stockDeducted,
    stockDeductedAt: order.stockDeductedAt,
    stockRestoredAt: undefined
  });
}

function serializeNotesPayload(notes: OrderNotesPayload) {
  return JSON.stringify({
    notes: notes.notes,
    source: notes.source,
    botStatus: notes.botStatus,
    designDetails: notes.designDetails,
    quoteOption: notes.quoteOption,
    referenceImages: notes.referenceImages ?? [],
    stockDeducted: notes.stockDeducted,
    stockDeductedAt: notes.stockDeductedAt,
    stockRestoredAt: notes.stockRestoredAt
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

function parseCatalogItemsFromNotes(notes: string | undefined, total: number): OrderLineItem[] {
  if (!notes) return [];

  const parsedItems = notes
    .split(";")
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(/^(\d+)x\s+(.+?)\s+\((.+?),\s*talla\s+(.+?)\)$/i);
      if (!match) return null;

      return {
        quantity: Math.max(1, Number(match[1])),
        productName: match[2].trim(),
        color: match[3].trim(),
        size: match[4].trim()
      };
    })
    .filter((item): item is { quantity: number; productName: string; color: string; size: string } => Boolean(item));

  const totalQuantity = parsedItems.reduce((sum, item) => sum + item.quantity, 0);
  if (!parsedItems.length || !totalQuantity) return [];

  const unitPrice = total / totalQuantity;

  return parsedItems.map((item) => ({
    ...item,
    unitPrice,
    lineTotal: item.quantity * unitPrice,
    isCustom: false
  }));
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
  const databaseItems = (row.order_items ?? []).map(itemRowToOrderLine);
  const databaseItemsTotal = databaseItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const total = Number(row.total ?? databaseItemsTotal);
  const legacyCatalogItems =
    row.order_type === "Catálogo" &&
    databaseItems.length === 1 &&
    databaseItems[0]?.productName.toLowerCase().includes("pedido catálogo")
      ? parseCatalogItemsFromNotes(notes.notes, total)
      : [];
  const items = legacyCatalogItems.length ? legacyCatalogItems : databaseItems;
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
    stockDeducted: notes.stockDeducted,
    stockDeductedAt: notes.stockDeductedAt,
    items
  };
}

function cleanOrderNumber(id: string) {
  return id.replace(/^#/, "");
}

function shouldDeductStock(status?: OrderStatus) {
  return status === "En preparación" || status === "Lista para enviar" || status === "Entregado";
}

async function deductOrderStock(order: Order) {
  const items = order.items?.length
    ? order.items
    : [
        {
          productName: order.product,
          size: order.size,
          color: order.color,
          quantity: order.prendas,
          unitPrice: 0,
          lineTotal: 0
        }
      ];

  for (const item of items) {
    if (!item.color || !item.size) continue;
    await adjustStockByColorSize(item.color, item.size, -Math.max(1, item.quantity || 1));
  }
}

function stockItemsForOrder(order: Order) {
  const items = order.items?.length
    ? order.items
    : [
        {
          productName: order.product,
          size: order.size,
          color: order.color,
          quantity: order.prendas,
          unitPrice: 0,
          lineTotal: 0
        }
      ];

  return items
    .filter((item) => item.color && item.size)
    .map((item) => ({
      color: item.color as string,
      size: item.size as string,
      quantity: Math.max(1, item.quantity || 1)
    }));
}

async function reserveOrderStock(order: Order) {
  const reserved: Array<{ color: string; size: string; quantity: number }> = [];

  for (const item of stockItemsForOrder(order)) {
    const ok = await reserveStockByColorSize(item.color, item.size, item.quantity);

    if (!ok) {
      await Promise.all(
        reserved.map((reservedItem) => adjustStockByColorSize(reservedItem.color, reservedItem.size, reservedItem.quantity))
      );
      throw new Error(`Sin stock suficiente para ${item.color} talla ${item.size}.`);
    }

    reserved.push(item);
  }

  return reserved;
}

async function restoreOrderStock(order: Order) {
  await Promise.all(
    stockItemsForOrder(order).map((item) => adjustStockByColorSize(item.color, item.size, item.quantity))
  );
}

export async function readOrders(): Promise<Order[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("orders")
    .select("*, order_items(product_name, size, color, quantity, unit_price, is_custom, custom_description)")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Supabase orders read failed.", error.message);
    return [];
  }

  return (data as OrderRow[]).map(rowToOrder);
}

export async function createOrder(order: Order): Promise<Order[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [order];

  const reservedStock = await reserveOrderStock(order);
  const orderToSave: Order = reservedStock.length
    ? { ...order, stockDeducted: true, stockDeductedAt: new Date().toISOString() }
    : order;
  const items = orderItemsForInsert(orderToSave);
  const total = Math.max(
    0,
    orderToSave.total || items.reduce((sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_price ?? 0), 0)
  );

  const { data: orderRow, error: orderError } = await supabase
    .from("orders")
    .insert({
      order_number: cleanOrderNumber(orderToSave.id),
      customer_name: orderToSave.customer,
      customer_phone: orderToSave.customerPhone,
      order_type: orderToSave.type,
      payment_status: orderToSave.payment,
      order_status: orderToSave.status,
      sales_channel: orderToSave.channel,
      delivery_method: orderToSave.delivery,
      subtotal: total,
      total,
      notes: serializeNotes(orderToSave)
    })
    .select("id")
    .single();

  if (orderError) {
    await restoreOrderStock(orderToSave);
    throw new Error(orderError.message);
  }

  const { error: itemError } = await supabase
    .from("order_items")
    .insert(items.map((item) => ({ ...item, order_id: orderRow.id })));

  if (itemError) {
    await restoreOrderStock(orderToSave);
    await supabase.from("orders").delete().eq("id", orderRow.id);
    throw new Error(itemError.message);
  }

  return readOrders();
}

export async function updateOrder(orderId: string, updates: Partial<Order>): Promise<Order[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data: currentRow, error: currentError } = await supabase
    .from("orders")
    .select("*, order_items(product_name, size, color, quantity, unit_price, is_custom, custom_description)")
    .eq("order_number", cleanOrderNumber(orderId))
    .single();

  if (currentError) throw new Error(currentError.message);

  const currentOrder = rowToOrder(currentRow as OrderRow);
  const currentNotes = parseNotes((currentRow as OrderRow).notes);
  const updatePayload: Record<string, unknown> = {};
  if (updates.payment) updatePayload.payment_status = updates.payment;
  if (updates.status) updatePayload.order_status = updates.status;
  if (updates.delivery) updatePayload.delivery_method = updates.delivery;

  const nextNotes: OrderNotesPayload = {
    ...currentNotes,
    notes: updates.notes ?? currentNotes.notes,
    source: updates.source ?? currentNotes.source,
    botStatus: updates.botStatus ?? currentNotes.botStatus,
    designDetails: updates.designDetails ?? currentNotes.designDetails,
    quoteOption: updates.quoteOption ?? currentNotes.quoteOption,
    referenceImages: updates.referenceImages ?? currentNotes.referenceImages ?? []
  };

  if (updates.notes !== undefined) updatePayload.notes = serializeNotesPayload(nextNotes);

  if (shouldDeductStock(updates.status) && !currentNotes.stockDeducted) {
    await deductOrderStock(currentOrder);
    nextNotes.stockDeducted = true;
    nextNotes.stockDeductedAt = new Date().toISOString();
    updatePayload.notes = serializeNotesPayload(nextNotes);
  }

  if (updates.status === "Cancelado" && currentNotes.stockDeducted) {
    await restoreOrderStock(currentOrder);
    nextNotes.stockDeducted = false;
    nextNotes.stockRestoredAt = new Date().toISOString();
    updatePayload.notes = serializeNotesPayload(nextNotes);
  }

  if (Object.keys(updatePayload).length) {
    const { error } = await supabase.from("orders").update(updatePayload).eq("order_number", cleanOrderNumber(orderId));
    if (error) throw new Error(error.message);
  }

  return readOrders();
}
