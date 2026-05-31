import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { createExpense, deleteExpense, readExpenses } from "@/lib/expenseRepository";
import { RequestSecurityError, assertAllowedOrigin, secureJsonHeaders } from "@/lib/requestSecurity";
import type { Expense } from "@/types";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    return NextResponse.json(await readExpenses(), { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 401;
    const message = error instanceof Error ? error.message : "No autorizado.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const expense = (await request.json()) as Expense;
    const expenses = await createExpense(expense);

    return NextResponse.json(expenses, { status: 201, headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo registrar el gasto.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function DELETE(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json(
        { error: "El gasto es requerido." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    const expenses = await deleteExpense(body.id);
    return NextResponse.json(expenses, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo eliminar el gasto.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
