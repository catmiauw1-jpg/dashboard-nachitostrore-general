import { NextResponse } from "next/server";
import { readPublicCatalogProducts } from "@/lib/productRepository";
import { secureJsonHeaders } from "@/lib/requestSecurity";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function GET(request: Request) {
  const publicProducts = await readPublicCatalogProducts();

  return NextResponse.json(publicProducts, { headers: secureJsonHeaders(request) });
}
