import { NextResponse } from "next/server";
import { jsonHeaders } from "@/lib/catalogStore";
import { readPublicCatalogProducts } from "@/lib/productRepository";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function GET() {
  const publicProducts = await readPublicCatalogProducts();

  return NextResponse.json(publicProducts, { headers: jsonHeaders() });
}
