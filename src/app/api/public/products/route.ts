import { NextResponse } from "next/server";
import { jsonHeaders, readCatalogProducts } from "@/lib/catalogStore";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function GET() {
  const products = await readCatalogProducts();
  const publicProducts = products.filter((product) => !product.isHidden);

  return NextResponse.json(publicProducts, { headers: jsonHeaders() });
}
