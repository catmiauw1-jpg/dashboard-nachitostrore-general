import { NextResponse } from "next/server";
import { jsonHeaders } from "@/lib/catalogStore";
import { readCatalogProducts } from "@/lib/productRepository";
import { adjustStockItem, readStockItems, upsertStockItem } from "@/lib/stockRepository";
import type { StockItem } from "@/types";

async function stockResponse(status = 200) {
  const [stock, products] = await Promise.all([readStockItems(), readCatalogProducts()]);

  return NextResponse.json({ stock, products }, { status, headers: jsonHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: jsonHeaders() });
}

export async function GET() {
  return stockResponse();
}

export async function PATCH(request: Request) {
  const item = (await request.json()) as StockItem;

  if (!item.productId || !item.size || !item.color) {
    return NextResponse.json(
      { error: "Producto, talla y color son requeridos." },
      { status: 400, headers: jsonHeaders() }
    );
  }

  await upsertStockItem(item);
  return stockResponse();
}

export async function POST(request: Request) {
  const body = (await request.json()) as { id: string; delta: number };

  if (!body.id || !Number.isFinite(body.delta)) {
    return NextResponse.json(
      { error: "La variante y el ajuste son requeridos." },
      { status: 400, headers: jsonHeaders() }
    );
  }

  await adjustStockItem(body.id, body.delta);
  return stockResponse();
}
