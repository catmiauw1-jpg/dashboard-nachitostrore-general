import { NextResponse } from "next/server";
import { updateMessageDeliveryStatus } from "@/lib/conversationRepository";
import { assertBodySize, cleanText, secureJsonHeaders } from "@/lib/requestSecurity";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getRecord(source: Record<string, unknown>, key: string) {
  return asRecord(source[key]) ?? {};
}

function firstNonEmptyRecord(records: Array<Record<string, unknown>>) {
  return records.find((record) => Object.keys(record).length > 0) ?? {};
}

function firstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function normalizeDeliveryStatus(value: string) {
  const status = value.trim().toLowerCase();
  if (["delivered", "delivery"].includes(status)) return "delivered";
  if (["read", "seen"].includes(status)) return "read";
  if (["failed", "undelivered", "error", "rejected"].includes(status)) return "failed";
  if (["sent", "send"].includes(status)) return "sent";
  if (["accepted", "queued", "submitted"].includes(status)) return "accepted";
  return status || "accepted";
}

function extractMessagePayload(payload: Record<string, unknown>) {
  const data = getRecord(payload, "data");
  const payloadBody = getRecord(payload, "payload");
  const message = firstNonEmptyRecord([
    getRecord(payload, "message"),
    getRecord(data, "message"),
    getRecord(payloadBody, "message"),
    data,
    payload
  ]);

  const messageId =
    firstString(message, ["id", "messageId", "message_id", "wamid", "whatsappMessageId"]) ||
    firstString(data, ["id", "messageId", "message_id", "wamid", "whatsappMessageId"]) ||
    firstString(payload, ["id", "messageId", "message_id", "wamid", "whatsappMessageId"]);

  const rawStatus =
    firstString(message, ["status", "messageStatus", "deliveryStatus"]) ||
    firstString(data, ["status", "messageStatus", "deliveryStatus"]) ||
    firstString(payload, ["status", "messageStatus", "deliveryStatus"]);

  const errorRecord = asRecord(message.error) ?? asRecord(data.error) ?? asRecord(payload.error);
  const error =
    firstString(errorRecord ?? {}, ["message", "description", "title", "detail"]) ||
    cleanText(message.error ?? data.error ?? payload.error, 240);

  const occurredAt =
    firstString(message, ["timestamp", "updatedAt", "createdAt"]) ||
    firstString(data, ["timestamp", "updatedAt", "createdAt"]) ||
    firstString(payload, ["timestamp", "updatedAt", "createdAt"]) ||
    undefined;

  return {
    messageId,
    status: normalizeDeliveryStatus(rawStatus),
    error: error || undefined,
    occurredAt
  };
}

function isAuthorized(request: Request) {
  const secret = process.env.YCLOUD_WEBHOOK_SECRET;
  if (!secret) return true;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const directSecret =
    request.headers.get("x-poleraflow-webhook-secret") ||
    request.headers.get("x-ycloud-webhook-secret") ||
    request.headers.get("x-webhook-secret");

  return bearer === secret || directSecret === secret;
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function POST(request: Request) {
  try {
    assertBodySize(request, 256_000);

    if (!isAuthorized(request)) {
      return NextResponse.json(
        { error: "Webhook no autorizado." },
        { status: 401, headers: secureJsonHeaders(request) }
      );
    }

    const payload = asRecord(await request.json().catch(() => null));
    if (!payload) {
      return NextResponse.json(
        { error: "Payload invalido." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    const event = firstString(payload, ["event", "type", "eventType"]);
    const message = extractMessagePayload(payload);

    if (!message.messageId || !message.status) {
      return NextResponse.json(
        { ok: true, ignored: true, reason: "missing_message_status", event },
        { headers: secureJsonHeaders(request) }
      );
    }

    const updated = await updateMessageDeliveryStatus({
      providerMessageId: message.messageId,
      status: message.status,
      error: message.error,
      occurredAt: message.occurredAt,
      payload: { event, ...payload }
    });

    return NextResponse.json(
      { ok: true, updated, messageId: message.messageId, status: message.status },
      { headers: secureJsonHeaders(request) }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo procesar el webhook.";
    console.error("YCloud delivery webhook failed.", message);

    return NextResponse.json(
      { error: message },
      { status: 400, headers: secureJsonHeaders(request) }
    );
  }
}
