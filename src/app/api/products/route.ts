import { NextResponse } from "next/server";
import { jsonHeaders } from "@/lib/catalogStore";
import {
  createCatalogProduct,
  deleteCatalogProduct,
  readCatalogProducts,
  updateCatalogProduct
} from "@/lib/productRepository";
import type { Product } from "@/types";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function GET() {
  const products = await readCatalogProducts();
  return NextResponse.json(products, { headers: jsonHeaders() });
}

export async function POST(request: Request) {
  try {
    const product = (await request.json()) as Product;
    await createCatalogProduct(product);

    return NextResponse.json(product, { status: 201, headers: jsonHeaders() });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el producto" },
      { status: 500, headers: jsonHeaders() }
    );
  }
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as { id: string; updates: Partial<Product> };
  const nextProducts = await updateCatalogProduct(body.id, body.updates);

  return NextResponse.json(nextProducts, { headers: jsonHeaders() });
}

export async function DELETE(request: Request) {
  const body = (await request.json()) as { id: string };
  const nextProducts = await deleteCatalogProduct(body.id);

  return NextResponse.json(nextProducts, { headers: jsonHeaders() });
}
