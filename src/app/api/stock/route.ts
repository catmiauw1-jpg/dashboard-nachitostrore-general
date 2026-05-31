import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { jsonHeaders } from "@/lib/catalogStore";
import { readCatalogProducts } from "@/lib/productRepository";
import { RequestSecurityError, assertAllowedOrigin, secureJsonHeaders } from "@/lib/requestSecurity";
import { adjustStockItem, deleteStockColor, readStockItems, upsertStockItem } from "@/lib/stockRepository";
import type { StockItem } from "@/types";

async function stockResponse(status = 200) {
  const [stock, products] = await Promise.all([readStockItems(), readCatalogProducts()]);

  return NextResponse.json({ stock, products }, { status, headers: jsonHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return stockResponse();
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 401;
    const message = error instanceof Error ? error.message : "No autorizado.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function PATCH(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const item = (await request.json()) as StockItem;

    if (!item.productId || !item.size || !item.color) {
      return NextResponse.json(
        { error: "Producto, talla y color son requeridos." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    await upsertStockItem(item);
    return stockResponse();
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo guardar el stock.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const body = (await request.json()) as { id: string; delta: number };

    if (!body.id || !Number.isFinite(body.delta)) {
      return NextResponse.json(
        { error: "La variante y el ajuste son requeridos." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    await adjustStockItem(body.id, body.delta);
    return stockResponse();
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo actualizar el stock.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function DELETE(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const body = (await request.json()) as { color?: string };

    if (!body.color?.trim()) {
      return NextResponse.json(
        { error: "El color es requerido." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    await deleteStockColor(body.color);
    return stockResponse();
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo eliminar el color.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
