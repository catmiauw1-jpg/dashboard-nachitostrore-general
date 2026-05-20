import { readFileCatalogProducts, writeFileCatalogProducts } from "@/lib/catalogStore";
import { createSupabaseAdminClient, createSupabasePublicClient } from "@/lib/supabase";
import type { Product } from "@/types";

interface ProductRow {
  id: string;
  name: string;
  category: Product["category"];
  web_category: string | null;
  description: string | null;
  base_price: number | string;
  colors: string[] | null;
  sizes: string[] | null;
  image_url: string | null;
  is_hidden: boolean | null;
  is_sold_out: boolean | null;
}

function rowToProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    webCategory: row.web_category ?? "catalogo",
    description: row.description ?? "",
    basePrice: Number(row.base_price),
    colors: row.colors ?? [],
    sizes: row.sizes ?? [],
    imageUrl: row.image_url ?? "",
    isHidden: Boolean(row.is_hidden),
    isSoldOut: Boolean(row.is_sold_out)
  };
}

function productToRow(product: Product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    web_category: product.webCategory ?? "catalogo",
    description: product.description ?? "",
    base_price: product.basePrice,
    colors: product.colors,
    sizes: product.sizes,
    image_url: product.imageUrl ?? "",
    is_hidden: Boolean(product.isHidden),
    is_sold_out: Boolean(product.isSoldOut)
  };
}

function updatesToRow(updates: Partial<Product>) {
  const row: Record<string, unknown> = {};

  if (updates.name !== undefined) row.name = updates.name;
  if (updates.category !== undefined) row.category = updates.category;
  if (updates.webCategory !== undefined) row.web_category = updates.webCategory;
  if (updates.description !== undefined) row.description = updates.description;
  if (updates.basePrice !== undefined) row.base_price = updates.basePrice;
  if (updates.colors !== undefined) row.colors = updates.colors;
  if (updates.sizes !== undefined) row.sizes = updates.sizes;
  if (updates.imageUrl !== undefined) row.image_url = updates.imageUrl;
  if (updates.isHidden !== undefined) row.is_hidden = updates.isHidden;
  if (updates.isSoldOut !== undefined) row.is_sold_out = updates.isSoldOut;

  return row;
}

export async function readCatalogProducts(): Promise<Product[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return readFileCatalogProducts();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Supabase products read failed. Falling back to file catalog.", error.message);
    return readFileCatalogProducts();
  }

  return (data as ProductRow[]).map(rowToProduct);
}

export async function readPublicCatalogProducts(options: { includeHidden?: boolean } = {}): Promise<Product[]> {
  const supabase = options.includeHidden ? createSupabaseAdminClient() : createSupabasePublicClient();
  if (!supabase) {
    const products = await readFileCatalogProducts();
    return options.includeHidden ? products : products.filter((product) => !product.isHidden);
  }

  let query = supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (!options.includeHidden) {
    query = query.eq("is_hidden", false);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Supabase public products read failed. Falling back to file catalog.", error.message);
    const products = await readFileCatalogProducts();
    return options.includeHidden ? products : products.filter((product) => !product.isHidden);
  }

  return (data as ProductRow[]).map(rowToProduct);
}

export async function createCatalogProduct(product: Product) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const products = await readFileCatalogProducts();
    await writeFileCatalogProducts([product, ...products.filter((item) => item.id !== product.id)]);
    return product;
  }

  const { error } = await supabase.from("products").upsert(productToRow(product), { onConflict: "id" });
  if (error) throw new Error(error.message);

  return product;
}

export async function updateCatalogProduct(productId: string, updates: Partial<Product>) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const products = await readFileCatalogProducts();
    const nextProducts = products.map((product) =>
      product.id === productId ? { ...product, ...updates, id: productId } : product
    );
    await writeFileCatalogProducts(nextProducts);
    return nextProducts;
  }

  const { error } = await supabase.from("products").update(updatesToRow(updates)).eq("id", productId);
  if (error) throw new Error(error.message);

  return readCatalogProducts();
}

export async function deleteCatalogProduct(productId: string) {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    const products = await readFileCatalogProducts();
    const nextProducts = products.filter((product) => product.id !== productId);
    await writeFileCatalogProducts(nextProducts);
    return nextProducts;
  }

  const { error } = await supabase.from("products").delete().eq("id", productId);
  if (error) throw new Error(error.message);

  return readCatalogProducts();
}
