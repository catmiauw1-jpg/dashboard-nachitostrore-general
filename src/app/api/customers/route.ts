import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { readCustomers, updateCustomerNotes } from "@/lib/customerRepository";
import { RequestSecurityError, assertAllowedOrigin, secureJsonHeaders } from "@/lib/requestSecurity";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const customers = await readCustomers();
    return NextResponse.json(customers, { headers: secureJsonHeaders(request) });
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

    const body = (await request.json()) as { id?: string; notes?: string };
    if (!body.id) {
      return NextResponse.json(
        { error: "Cliente requerido." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    const customers = await updateCustomerNotes(body.id, body.notes ?? "");
    return NextResponse.json(customers, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo actualizar el cliente.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
