import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/adminAuth";
import { createManualConversationMessage, readConversations, updateConversationBot } from "@/lib/conversationRepository";
import { RequestSecurityError, assertAllowedOrigin, secureJsonHeaders } from "@/lib/requestSecurity";

type ManualSendStatus =
  | { sent: true }
  | { sent: false; reason: "missing_ycloud_config" | "missing_phone" | "ycloud_error"; detail?: string };

function normalizeYCloudPhone(value?: string) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

async function sendYCloudTextMessage(phone: string | undefined, message: string): Promise<ManualSendStatus> {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = normalizeYCloudPhone(process.env.YCLOUD_WHATSAPP_FROM || "59178096231");
  const to = normalizeYCloudPhone(phone);

  if (!apiKey || !from) {
    return { sent: false, reason: "missing_ycloud_config" };
  }

  if (!to) {
    return { sent: false, reason: "missing_phone" };
  }

  const response = await fetch("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      from,
      to,
      type: "text",
      text: { body: message }
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return {
      sent: false,
      reason: "ycloud_error",
      detail: detail.slice(0, 240)
    };
  }

  return { sent: true };
}

function manualSendError(status: ManualSendStatus) {
  if (status.sent) return { statusCode: 200, message: "" };

  if (status.reason === "missing_ycloud_config") {
    return {
      statusCode: 503,
      message: "YCloud no esta configurado en produccion."
    };
  }

  if (status.reason === "missing_phone") {
    return {
      statusCode: 400,
      message: "Este chat no tiene un numero de WhatsApp valido."
    };
  }

  return {
    statusCode: 502,
    message: status.detail
      ? `YCloud rechazo el mensaje: ${status.detail}`
      : "YCloud rechazo el mensaje."
  };
}

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
      body: cleanMessage
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
