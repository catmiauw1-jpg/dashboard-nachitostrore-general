import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { createManualConversationMessage, readConversations, updateConversationBot } from "@/lib/conversationRepository";
import { RequestSecurityError, assertAllowedOrigin, secureJsonHeaders } from "@/lib/requestSecurity";

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function GET(request: Request) {
  try {
    await requireAdminRequest(request);
    const conversations = await readConversations();
    return NextResponse.json(conversations, { headers: secureJsonHeaders(request) });
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

    const body = (await request.json()) as { id?: string; phone?: string; bot?: boolean };
    if (typeof body.bot !== "boolean") {
      return NextResponse.json(
        { error: "Estado del bot requerido." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    const conversations = await updateConversationBot({ id: body.id, phone: body.phone, bot: body.bot });
    return NextResponse.json(conversations, { headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo actualizar la conversacion.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}

export async function POST(request: Request) {
  try {
    assertAllowedOrigin(request);
    await requireAdminRequest(request);

    const body = (await request.json()) as { id?: string; phone?: string; message?: string };
    const conversations = await createManualConversationMessage({
      id: body.id,
      phone: body.phone,
      body: body.message ?? ""
    });

    return NextResponse.json(conversations, { status: 201, headers: secureJsonHeaders(request) });
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo guardar el mensaje.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
