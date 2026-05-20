import { createSupabaseAdminClient } from "@/lib/supabase";
import type { Product, StockItem } from "@/types";

interface StockRow {
  id: string;
  product_id: string;
  size: string;
  color: string;
  stock_quantity: number | null;
  min_stock: number | null;
  products?: {
    name?: string | null;
  } | null;
}

function variantId(productId: string, color: string, size: string) {
  return `${productId}::${color}::${size}`;
}

function rowToStockItem(row: StockRow): StockItem {
  const productName = row.products?.name ?? row.product_id;

  return {
    id: row.id || variantId(row.product_id, row.color, row.size),
    productId: row.product_id,
    productName,
    size: row.size,
    color: row.color,
    item: `${productName} ${row.color} ${row.size}`,
    available: Number(row.stock_quantity ?? 0),
    min: Number(row.min_stock ?? 0)
  };
}

export function fallbackStockForProducts(products: Product[]): StockItem[] {
  return products.flatMap((product) => {
    const color = product.colors[0] ?? "Color por confirmar";

    return (product.sizes.length ? product.sizes : ["M", "L", "XL"]).map((size) => ({
      id: variantId(product.id, color, size),
      productId: product.id,
      productName: product.name,
      size,
      color,
      item: `${product.name} ${color} ${size}`,
      available: 0,
      min: 1
    }));
  });
}

async function syncProductSoldOut(productId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from("product_variants")
    .select("stock_quantity")
    .eq("product_id", productId);

  if (error || !data?.length) return;

  const totalStock = data.reduce((sum, row) => sum + Number(row.stock_quantity ?? 0), 0);
  await supabase.from("products").update({ is_sold_out: totalStock <= 0 }).eq("id", productId);
}

export async function readStockItems(): Promise<StockItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, size, color, stock_quantity, min_stock, products(name)")
    .order("product_id", { ascending: true })
    .order("color", { ascending: true })
    .order("size", { ascending: true });

  if (error) {
    console.warn("Supabase stock read failed.", error.message);
    return [];
  }

  return (data as StockRow[]).map(rowToStockItem);
}

export async function readStockByProductIds(productIds: string[]): Promise<Record<string, StockItem[]>> {
  const supabase = createSupabaseAdminClient();
  if (!supabase || !productIds.length) return {};

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, size, color, stock_quantity, min_stock, products(name)")
    .in("product_id", productIds);

  if (error) {
    console.warn("Supabase stock join failed.", error.message);
    return {};
  }

  return (data as StockRow[]).map(rowToStockItem).reduce<Record<string, StockItem[]>>((itemsByProduct, item) => {
    itemsByProduct[item.productId] = [...(itemsByProduct[item.productId] ?? []), item];
    return itemsByProduct;
  }, {});
}

export async function upsertStockItem(item: StockItem): Promise<StockItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { error } = await supabase.from("product_variants").upsert(
    {
      product_id: item.productId,
      size: item.size,
      color: item.color,
      stock_quantity: Math.max(0, item.available),
      min_stock: Math.max(0, item.min)
    },
    { onConflict: "product_id,size,color" }
  );

  if (error) throw new Error(error.message);

  await syncProductSoldOut(item.productId);
  return readStockItems();
}

export async function adjustStockItem(itemId: string, delta: number): Promise<StockItem[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data: current, error: readError } = await supabase
    .from("product_variants")
    .select("id, product_id, stock_quantity")
    .eq("id", itemId)
    .single();

  if (readError) throw new Error(readError.message);

  const nextQuantity = Math.max(0, Number(current.stock_quantity ?? 0) + delta);
  const { error: updateError } = await supabase
    .from("product_variants")
    .update({ stock_quantity: nextQuantity })
    .eq("id", itemId);

  if (updateError) throw new Error(updateError.message);

  await syncProductSoldOut(current.product_id);
  return readStockItems();
}
