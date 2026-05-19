import { NextResponse } from "next/server";
import { jsonHeaders, readCatalogProducts, writeCatalogProducts } from "@/lib/catalogStore";
import type { Product } from "@/types";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function GET() {
  const products = await readCatalogProducts();
  return NextResponse.json(products, { headers: jsonHeaders() });
}

export async function POST(request: Request) {
  const product = (await request.json()) as Product;
  const products = await readCatalogProducts();
  const nextProducts = [product, ...products.filter((item) => item.id !== product.id)];

  await writeCatalogProducts(nextProducts);

  return NextResponse.json(product, { status: 201, headers: jsonHeaders() });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id: string; updates: Partial<Product> };
  const products = await readCatalogProducts();

  const nextProducts = products.map((product) =>
    product.id === body.id ? { ...product, ...body.updates } : product
  );

  await writeCatalogProducts(nextProducts);

  return NextResponse.json(nextProducts, { headers: jsonHeaders() });
}
