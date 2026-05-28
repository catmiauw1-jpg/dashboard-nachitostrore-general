import { createSupabaseAdminClient } from "@/lib/supabase";
import type { Product, StockItem } from "@/types";

const BASE_PRODUCT_ID = "base-polera-dtf";
const BASE_PRODUCT_NAME = "Polera base DTF";
const sizeOrder = ["M", "L", "XL"];
const colorOrder = ["Blanco arena", "Negro"];

interface BaseStockRow {
  id: string;
  size: string;
  color: string;
  stock_quantity: number | null;
  min_stock: number | null;
}

function baseStockId(color: string, size: string) {
  return `${BASE_PRODUCT_ID}::${color}::${size}`;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function rowToStockItem(row: BaseStockRow): StockItem {
  return {
    id: row.id || baseStockId(row.color, row.size),
    productId: BASE_PRODUCT_ID,
    productName: BASE_PRODUCT_NAME,
    size: row.size,
    color: row.color,
    item: `${BASE_PRODUCT_NAME} ${row.color} ${row.size}`,
    available: Number(row.stock_quantity ?? 0),
    min: Number(row.min_stock ?? 1)
  };
}

function sortStock(items: StockItem[]) {
  return [...items].sort((first, second) => {
    const colorDiff = colorOrder.indexOf(first.color) - colorOrder.indexOf(second.color);
    if (colorDiff !== 0) return colorDiff;
    return sizeOrder.indexOf(first.size) - sizeOrder.indexOf(second.size);
  });
}

export const defaultBaseStock: StockItem[] = sortStock([
  { id: baseStockId("Blanco arena", "M"), productId: BASE_PRODUCT_ID, productName: BASE_PRODUCT_NAME, size: "M", color: "Blanco arena", item: `${BASE_PRODUCT_NAME} Blanco arena M`, available: 2, min: 1 },
  { id: baseStockId("Blanco arena", "L"), productId: BASE_PRODUCT_ID, productName: BASE_PRODUCT_NAME, size: "L", color: "Blanco arena", item: `${BASE_PRODUCT_NAME} Blanco arena L`, available: 5, min: 1 },
  { id: baseStockId("Blanco arena", "XL"), productId: BASE_PRODUCT_ID, productName: BASE_PRODUCT_NAME, size: "XL", color: "Blanco arena", item: `${BASE_PRODUCT_NAME} Blanco arena XL`, available: 3, min: 1 },
  { id: baseStockId("Negro", "M"), productId: BASE_PRODUCT_ID, productName: BASE_PRODUCT_NAME, size: "M", color: "Negro", item: `${BASE_PRODUCT_NAME} Negro M`, available: 3, min: 1 },
  { id: baseStockId("Negro", "L"), productId: BASE_PRODUCT_ID, productName: BASE_PRODUCT_NAME, size: "L", color: "Negro", item: `${BASE_PRODUCT_NAME} Negro L`, available: 3, min: 1 },
  { id: baseStockId("Negro", "XL"), productId: BASE_PRODUCT_ID, productName: BASE_PRODUCT_NAME, size: "XL", color: "Negro", item: `${BASE_PRODUCT_NAME} Negro XL`, available: 2, min: 1 }
]);

function stockForProduct(product: Product, baseStock: StockItem[]) {
  const productColors = new Set((product.colors.length ? product.colors : ["Negro"]).map(normalize));
  const productSizes = new Set((product.sizes.length ? product.sizes : sizeOrder).map(normalize));

  return baseStock.filter((item) => productColors.has(normalize(item.color)) && productSizes.has(normalize(item.size)));
}

async function syncDesignedProductsSoldOut(baseStock: StockItem[]) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  const { data, error } = await supabase.from("products").select("*");
  if (error || !data) return;

  await Promise.all(
    (data as Product[]).map(async (product) => {
      const matchingStock = stockForProduct(product, baseStock);
      if (!matchingStock.length) return;

      const totalAvailable = matchingStock.reduce((sum, item) => sum + item.available, 0);
      await supabase.from("products").update({ is_sold_out: totalAvailable <= 0 }).eq("id", product.id);
    })
  );
}

export async function readStockItems(): Promise<StockItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return defaultBaseStock;

  const { data, error } = await supabase
    .from("base_garment_stock")
    .select("id, size, color, stock_quantity, min_stock")
    .order("color", { ascending: true })
    .order("size", { ascending: true });

  if (error) {
    console.warn("Supabase base stock read failed.", error.message);
    return defaultBaseStock;
  }

  return sortStock((data as BaseStockRow[]).map(rowToStockItem));
}

export async function readStockByProductIds(productIds: string[]): Promise<Record<string, StockItem[]>> {
  if (!productIds.length) return {};

  const supabase = createSupabaseAdminClient();
  const baseStock = await readStockItems();

  if (!supabase) return {};

  const { data, error } = await supabase.from("products").select("*").in("id", productIds);
  if (error || !data) return {};

  return (data as Product[]).reduce<Record<string, StockItem[]>>((itemsByProduct, product) => {
    itemsByProduct[product.id] = stockForProduct(product, baseStock);
    return itemsByProduct;
  }, {});
}

export async function upsertStockItem(item: StockItem): Promise<StockItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return defaultBaseStock;

  const { error } = await supabase.from("base_garment_stock").upsert(
    {
      color: item.color,
      size: item.size,
      stock_quantity: Math.max(0, item.available),
      min_stock: Math.max(0, item.min)
    },
    { onConflict: "color,size" }
  );

  if (error) throw new Error(error.message);

  const nextStock = await readStockItems();
  await syncDesignedProductsSoldOut(nextStock);
  return nextStock;
}

export async function adjustStockItem(itemId: string, delta: number): Promise<StockItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return defaultBaseStock;

  const { data: current, error: readError } = await supabase
    .from("base_garment_stock")
    .select("id, stock_quantity")
    .eq("id", itemId)
    .single();

  if (readError) throw new Error(readError.message);

  const nextQuantity = Math.max(0, Number(current.stock_quantity ?? 0) + delta);
  const { error: updateError } = await supabase
    .from("base_garment_stock")
    .update({ stock_quantity: nextQuantity })
    .eq("id", itemId);

  if (updateError) throw new Error(updateError.message);

  const nextStock = await readStockItems();
  await syncDesignedProductsSoldOut(nextStock);
  return nextStock;
}

export async function deleteStockColor(color: string): Promise<StockItem[]> {
  const supabase = createSupabaseAdminClient();
  const cleanColor = color.trim();
  if (!cleanColor) return readStockItems();

  if (!supabase) return defaultBaseStock.filter((item) => normalize(item.color) !== normalize(cleanColor));

  const currentStock = await readStockItems();
  const matchingItems = currentStock.filter((item) => normalize(item.color) === normalize(cleanColor));
  if (!matchingItems.length) return currentStock;

  const { error } = await supabase
    .from("base_garment_stock")
    .delete()
    .in("id", matchingItems.map((item) => item.id));

  if (error) throw new Error(error.message);

  const nextStock = await readStockItems();
  await syncDesignedProductsSoldOut(nextStock);
  return nextStock;
}

export async function adjustStockByColorSize(color: string, size: string, delta: number): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const stock = await readStockItems();
  const matchingItem = stock.find((item) => normalize(item.color) === normalize(color) && normalize(item.size) === normalize(size));
  if (!matchingItem) return false;

  await adjustStockItem(matchingItem.id, delta);
  return true;
}
