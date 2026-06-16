import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import {
  createManualConversationMessage,
  getConversationSendWindow,
  readConversations,
  updateConversationBot
} from "@/lib/conversationRepository";
import { RequestSecurityError, assertAllowedOrigin, secureJsonHeaders } from "@/lib/requestSecurity";
import { manualSendError, sendYCloudTextMessage } from "@/lib/ycloud";

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
    const cleanMessage = (body.message ?? "").trim();
    if (!cleanMessage) {
      return NextResponse.json(
        { error: "Mensaje requerido." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    const sendWindow = await getConversationSendWindow({ id: body.id, phone: body.phone });
    if (!sendWindow.allowed) {
      const errorMessage =
        sendWindow.reason === "whatsapp_session_expired"
          ? "No se envio: este chat esta fuera de la ventana de 24 horas de WhatsApp. Abre WhatsApp manualmente o usa una plantilla aprobada por YCloud."
          : "No se envio: el cliente todavia no escribio a este chat por WhatsApp.";

      return NextResponse.json(
        { error: errorMessage, sendWindow },
        { status: 409, headers: secureJsonHeaders(request) }
      );
    }

    const sendStatus = await sendYCloudTextMessage(body.phone, cleanMessage);
    if (!sendStatus.sent) {
      const error = manualSendError(sendStatus);
      console.warn("Manual WhatsApp send failed.", {
        reason: sendStatus.reason,
        detail: sendStatus.detail
      });

      return NextResponse.json(
        { error: error.message, sendStatus },
        { status: error.statusCode, headers: secureJsonHeaders(request) }
      );
    }

    const conversations = await createManualConversationMessage({
      id: body.id,
      phone: body.phone,
      body: cleanMessage,
      providerMessageId: sendStatus.providerMessageId,
      deliveryStatus: "accepted",
      deliveryPayload: sendStatus.response
    });

    return NextResponse.json(
      { conversations, sendStatus },
      { status: 201, headers: secureJsonHeaders(request) }
    );
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo guardar el mensaje.";
    return NextResponse.json({ error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
