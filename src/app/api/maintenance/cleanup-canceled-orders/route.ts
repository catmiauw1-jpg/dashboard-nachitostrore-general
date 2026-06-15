import { NextResponse } from "next/server";
import { deleteCanceledOrders } from "@/lib/orderRepository";
import { secureJsonHeaders } from "@/lib/requestSecurity";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");

  return Boolean(secret && authHeader === `Bearer ${secret}`);
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401, headers: secureJsonHeaders(request) });
  }

  try {
    const deleted = await deleteCanceledOrders();

    return NextResponse.json(
      {
        ok: true,
        deleted,
        cleanedAt: new Date().toISOString()
      },
      { headers: secureJsonHeaders(request) }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo limpiar pedidos cancelados." },
      { status: 500, headers: secureJsonHeaders(request) }
    );
  }
}
