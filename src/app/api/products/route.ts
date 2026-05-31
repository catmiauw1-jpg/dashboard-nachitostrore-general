import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { jsonHeaders } from "@/lib/catalogStore";
import { RequestSecurityError, assertAllowedOrigin, secureJsonHeaders } from "@/lib/requestSecurity";
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

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 401;
    const message = error instanceof Error ? error.message : "No autorizado.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }

  const products = await readCatalogProducts();
  return NextResponse.json(products, { headers: secureJsonHeaders(request) });
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const product = (await request.json()) as Product;
    await createCatalogProduct(product);

    return NextResponse.json(product, { status: 201, headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo crear el producto" },
      { status, headers: secureJsonHeaders(request) }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const body = (await request.json()) as { id: string; updates: Partial<Product> };
    const nextProducts = await updateCatalogProduct(body.id, body.updates);

    return NextResponse.json(nextProducts, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo actualizar el producto.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function DELETE(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const body = (await request.json()) as { id: string };
    const nextProducts = await deleteCatalogProduct(body.id);

    return NextResponse.json(nextProducts, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo eliminar el producto.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
