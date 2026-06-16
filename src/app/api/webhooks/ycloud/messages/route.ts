import { NextResponse } from "next/server";
import { createSyncedProviderMessage, updateMessageDeliveryStatus } from "@/lib/conversationRepository";
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

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 24) : "";
}

function deepString(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    const record = asRecord(current);
    if (!record) return "";
    current = record[key];
  }

  return typeof current === "string" && current.trim() ? current.trim() : "";
}

function firstDeepString(source: unknown, paths: string[][]) {
  for (const path of paths) {
    const value = deepString(source, path);
    if (value) return value;
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

function textFromRecord(record: Record<string, unknown>) {
  const text = record.text;
  if (typeof text === "string") return text.trim();
  const textRecord = asRecord(text);
  return (
    firstString(textRecord ?? {}, ["body", "text", "content", "caption"]) ||
    firstString(record, ["body", "content", "caption", "messageText"])
  );
}

function extractAttachment(message: Record<string, unknown>, payload: Record<string, unknown>) {
  const image = asRecord(message.image) ?? asRecord(firstDeepRecord(payload, [["data", "image"], ["payload", "image"]]));
  const document = asRecord(message.document) ?? asRecord(firstDeepRecord(payload, [["data", "document"], ["payload", "document"]]));
  const attachments = Array.isArray(message.attachments)
    ? message.attachments
    : Array.isArray(payload.attachments)
      ? payload.attachments
      : [];
  const first = asRecord(attachments[0]);
  const source = first ?? image ?? document ?? {};
  const type =
    firstString(source, ["mime_type", "mimeType", "type"]) ||
    (image ? "image" : document ? "document" : "");

  const mediaId = firstString(source, ["id", "mediaId", "media_id"]);
  const url =
    firstString(source, ["url", "link", "file_url", "data_url", "thumb_url"]) ||
    (mediaId ? `https://api.ycloud.com/v2/whatsapp/media/download/${encodeURIComponent(mediaId)}` : "");

  return {
    url: url || undefined,
    type: type || undefined,
    mediaId: mediaId || undefined,
    fileName: firstString(source, ["file_name", "filename", "name"]) || undefined
  };
}

function firstDeepRecord(source: unknown, paths: string[][]) {
  for (const path of paths) {
    let current = source;
    for (const key of path) {
      const record = asRecord(current);
      if (!record) {
        current = null;
        break;
      }
      current = record[key];
    }

    const record = asRecord(current);
    if (record) return record;
  }

  return null;
}

function boolFromRecord(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      if (/^(true|1|yes|si)$/i.test(value)) return true;
      if (/^(false|0|no)$/i.test(value)) return false;
    }
  }

  return false;
}

function extractSyncMessage(payload: Record<string, unknown>) {
  const data = getRecord(payload, "data");
  const payloadBody = getRecord(payload, "payload");
  const message = firstNonEmptyRecord([
    getRecord(payload, "message"),
    getRecord(data, "message"),
    getRecord(payloadBody, "message"),
    getRecord(payload, "whatsappMessage"),
    getRecord(data, "whatsappMessage"),
    data,
    payload
  ]);

  const event = firstString(payload, ["event", "type", "eventType"]).toLowerCase();
  const text =
    textFromRecord(message) ||
    firstDeepString(payload, [
      ["data", "text", "body"],
      ["payload", "text", "body"],
      ["text", "body"]
    ]);
  const attachment = extractAttachment(message, payload);
  const messageId =
    firstString(message, ["id", "messageId", "message_id", "wamid", "whatsappMessageId"]) ||
    firstString(data, ["id", "messageId", "message_id", "wamid", "whatsappMessageId"]) ||
    firstString(payload, ["id", "messageId", "message_id", "wamid", "whatsappMessageId"]);
  const directionValue = (
    firstString(message, ["direction", "messageDirection"]) ||
    firstString(data, ["direction", "messageDirection"]) ||
    firstString(payload, ["direction", "messageDirection"])
  ).toLowerCase();

  const from = normalizePhone(
    firstString(message, ["from", "fromNumber", "sender", "wa_id"]) ||
      firstString(data, ["from", "fromNumber", "sender", "wa_id"]) ||
      firstString(payload, ["from", "fromNumber", "sender", "wa_id"])
  );
  const to = normalizePhone(
    firstString(message, ["to", "toNumber", "recipient"]) ||
      firstString(data, ["to", "toNumber", "recipient"]) ||
      firstString(payload, ["to", "toNumber", "recipient"])
  );
  const businessPhone = normalizePhone(process.env.YCLOUD_WHATSAPP_FROM || "59178096231");
  const fromMe =
    boolFromRecord(message, ["fromMe", "isFromMe", "isEcho"]) ||
    boolFromRecord(data, ["fromMe", "isFromMe", "isEcho"]) ||
    boolFromRecord(payload, ["fromMe", "isFromMe", "isEcho"]);
  const direction =
    fromMe || directionValue === "outbound" || directionValue === "outgoing" || (businessPhone && from === businessPhone)
      ? "outbound"
      : "inbound";
  const phone =
    direction === "outbound"
      ? to || normalizePhone(firstDeepString(payload, [["contact", "phone"], ["data", "contact", "phone"], ["payload", "contact", "phone"]]))
      : from || normalizePhone(firstDeepString(payload, [["contact", "phone"], ["data", "contact", "phone"], ["payload", "contact", "phone"]]));
  const customerName =
    firstDeepString(payload, [
      ["contact", "name"],
      ["contact", "profile", "name"],
      ["data", "contact", "name"],
      ["data", "contact", "profile", "name"],
      ["payload", "contact", "name"]
    ]) || "Cliente WhatsApp";
  const createdAt =
    firstString(message, ["timestamp", "createdAt", "sentAt"]) ||
    firstString(data, ["timestamp", "createdAt", "sentAt"]) ||
    firstString(payload, ["timestamp", "createdAt", "sentAt"]) ||
    undefined;

  const hasContent = Boolean(text || attachment.url || attachment.mediaId);
  const isMessageEvent =
    event.includes("inbound") ||
    event.includes("outbound") ||
    event.includes("history") ||
    event.includes("state.sync") ||
    event.includes("message.received") ||
    event.includes("message.created") ||
    event.includes("message.updated") ||
    (!event && hasContent);

  if (!hasContent || !phone || !isMessageEvent) return null;

  return {
    phone,
    customerName,
    direction: direction as "inbound" | "outbound",
    body: cleanText(text, 2000) || `[${attachment.type || "mensaje"}]`,
    providerMessageId: messageId || undefined,
    deliveryStatus: direction === "outbound" ? "sent" : "local",
    attachmentUrl: attachment.url,
    attachmentType: attachment.type,
    createdAt,
    metadata: {
      raw: payload,
      attachmentDetails: attachment,
      event
    }
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
    const syncedMessage = extractSyncMessage(payload);
    const insertedMessage = syncedMessage
      ? await createSyncedProviderMessage({
          ...syncedMessage,
          source: "ycloud"
        })
      : false;

    const message = extractMessagePayload(payload);

    if (!message.messageId || !message.status) {
      return NextResponse.json(
        { ok: true, insertedMessage, ignored: !insertedMessage, reason: "missing_message_status", event },
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
      { ok: true, updated, insertedMessage, messageId: message.messageId, status: message.status },
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
