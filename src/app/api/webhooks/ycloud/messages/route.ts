import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createSyncedProviderMessage, updateMessageDeliveryStatus } from "@/lib/conversationRepository";
import { assertBodySize, cleanText, secureJsonHeaders } from "@/lib/requestSecurity";
import { sendYCloudImageMessage, sendYCloudTextMessage } from "@/lib/ycloud";

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

function firstArrayRecord(value: unknown) {
  if (!Array.isArray(value)) return {};
  return asRecord(value.find((item) => asRecord(item))) ?? {};
}

function getMessageCandidates(payload: Record<string, unknown>) {
  const data = getRecord(payload, "data");
  const payloadBody = getRecord(payload, "payload");

  return [
    getRecord(payload, "whatsappInboundMessage"),
    getRecord(data, "whatsappInboundMessage"),
    getRecord(payloadBody, "whatsappInboundMessage"),
    getRecord(payload, "whatsappOutboundMessage"),
    getRecord(data, "whatsappOutboundMessage"),
    getRecord(payloadBody, "whatsappOutboundMessage"),
    getRecord(payload, "whatsappMessage"),
    getRecord(data, "whatsappMessage"),
    getRecord(payloadBody, "whatsappMessage"),
    getRecord(payload, "whatsappMessageUpdated"),
    getRecord(data, "whatsappMessageUpdated"),
    getRecord(payloadBody, "whatsappMessageUpdated"),
    getRecord(payload, "message"),
    getRecord(data, "message"),
    getRecord(payloadBody, "message"),
    firstArrayRecord(payload.whatsappInboundMessages),
    firstArrayRecord(data.whatsappInboundMessages),
    firstArrayRecord(payloadBody.whatsappInboundMessages),
    firstArrayRecord(payload.whatsappMessages),
    firstArrayRecord(data.whatsappMessages),
    firstArrayRecord(payloadBody.whatsappMessages),
    firstArrayRecord(payload.messages),
    firstArrayRecord(data.messages),
    firstArrayRecord(payloadBody.messages),
    data,
    payloadBody,
    payload
  ];
}

function firstString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function payloadEvent(payload: Record<string, unknown>) {
  const data = getRecord(payload, "data");
  const payloadBody = getRecord(payload, "payload");

  return (
    firstString(payload, ["event", "type", "eventType"]) ||
    firstString(data, ["event", "type", "eventType"]) ||
    firstString(payloadBody, ["event", "type", "eventType"])
  );
}

function isStatusOnlyEvent(event: string) {
  const normalizedEvent = event.toLowerCase();
  return normalizedEvent.includes("message.updated") || normalizedEvent.includes("status");
}

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 24) : "";
}

function deepString(source: unknown, path: string[]) {
  let current = source;
  for (const key of path) {
    if (Array.isArray(current) && /^\d+$/.test(key)) {
      current = current[Number(key)];
      continue;
    }

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
  const message = firstNonEmptyRecord(getMessageCandidates(payload));

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
    firstString(record, ["body", "content", "caption", "messageText", "textBody"])
  );
}

function extractAttachment(message: Record<string, unknown>, payload: Record<string, unknown>) {
  const image = asRecord(message.image) ?? asRecord(firstDeepRecord(payload, [
    ["whatsappInboundMessage", "image"],
    ["whatsappMessage", "image"],
    ["data", "whatsappInboundMessage", "image"],
    ["data", "whatsappMessage", "image"],
    ["payload", "whatsappInboundMessage", "image"],
    ["payload", "whatsappMessage", "image"],
    ["data", "image"],
    ["payload", "image"]
  ]));
  const document = asRecord(message.document) ?? asRecord(firstDeepRecord(payload, [
    ["whatsappInboundMessage", "document"],
    ["whatsappMessage", "document"],
    ["data", "whatsappInboundMessage", "document"],
    ["data", "whatsappMessage", "document"],
    ["payload", "whatsappInboundMessage", "document"],
    ["payload", "whatsappMessage", "document"],
    ["data", "document"],
    ["payload", "document"]
  ]));
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
  const message = firstNonEmptyRecord(getMessageCandidates(payload));

  const event = (
    firstString(payload, ["event", "type", "eventType"]) ||
    firstString(data, ["event", "type", "eventType"]) ||
    firstString(payloadBody, ["event", "type", "eventType"])
  ).toLowerCase();
  const text =
    textFromRecord(message) ||
    firstDeepString(payload, [
      ["whatsappInboundMessage", "text", "body"],
      ["whatsappMessage", "text", "body"],
      ["data", "whatsappInboundMessage", "text", "body"],
      ["data", "whatsappMessage", "text", "body"],
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
      firstString(payload, ["from", "fromNumber", "sender", "wa_id"]) ||
      firstDeepString(payload, [
        ["sender", "phone"],
        ["sender", "phoneNumber"],
        ["data", "sender", "phone"],
        ["data", "sender", "phoneNumber"],
        ["contact", "wa_id"],
        ["contacts", "0", "wa_id"]
      ])
  );
  const to = normalizePhone(
    firstString(message, ["to", "toNumber", "recipient"]) ||
      firstString(data, ["to", "toNumber", "recipient"]) ||
      firstString(payload, ["to", "toNumber", "recipient"]) ||
      firstDeepString(payload, [
        ["recipient", "phone"],
        ["recipient", "phoneNumber"],
        ["data", "recipient", "phone"],
        ["data", "recipient", "phoneNumber"]
      ])
  );
  const businessPhone = normalizePhone(process.env.YCLOUD_WHATSAPP_FROM || "59178096231");
  const fromMe =
    boolFromRecord(message, ["fromMe", "isFromMe", "isEcho"]) ||
    boolFromRecord(data, ["fromMe", "isFromMe", "isEcho"]) ||
    boolFromRecord(payload, ["fromMe", "isFromMe", "isEcho"]);
  const direction =
    fromMe ||
    directionValue === "outbound" ||
    directionValue === "outgoing" ||
    event.includes("message_echoes") ||
    (businessPhone && from === businessPhone)
      ? "outbound"
      : "inbound";
  const phone =
    direction === "outbound"
      ? to || normalizePhone(firstDeepString(payload, [["contact", "phone"], ["data", "contact", "phone"], ["payload", "contact", "phone"]]))
      : from || normalizePhone(firstDeepString(payload, [["contact", "phone"], ["data", "contact", "phone"], ["payload", "contact", "phone"]]));
  const customerName =
    firstDeepString(payload, [
      ["whatsappInboundMessage", "profile", "name"],
      ["whatsappMessage", "profile", "name"],
      ["data", "whatsappInboundMessage", "profile", "name"],
      ["data", "whatsappMessage", "profile", "name"],
      ["contacts", "0", "profile", "name"],
      ["data", "contacts", "0", "profile", "name"],
      ["contact", "name"],
      ["contact", "profile", "name"],
      ["data", "contact", "name"],
      ["data", "contact", "profile", "name"],
      ["payload", "contact", "name"]
    ]) || "Cliente WhatsApp";
  const createdAt =
    firstString(message, ["timestamp", "createdAt", "sentAt", "sendTime", "receiveTime", "createTime"]) ||
    firstString(data, ["timestamp", "createdAt", "sentAt", "sendTime", "receiveTime", "createTime"]) ||
    firstString(payload, ["timestamp", "createdAt", "sentAt", "sendTime", "receiveTime", "createTime"]) ||
    undefined;

  const hasContent = Boolean(text || attachment.url || attachment.mediaId);
  const isMessageEvent =
    event.includes("inbound") ||
    event.includes("outbound") ||
    event.includes("history") ||
    event.includes("state.sync") ||
    event.includes("message_echoes") ||
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

function safeCompare(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseSignatureValues(value: string) {
  return value
    .split(/\s+/)
    .flatMap((chunk) => chunk.split(","))
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/^v\d+=?/i, "").replace(/^sha256=/i, ""));
}

function standardWebhookSecret(secret: string) {
  if (!secret.startsWith("whsec_")) return Buffer.from(secret);
  try {
    return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  } catch {
    return Buffer.from(secret);
  }
}

function hasStandardWebhookSignature(request: Request, rawBody: string, secret: string) {
  const id =
    request.headers.get("webhook-id") ||
    request.headers.get("svix-id") ||
    request.headers.get("x-webhook-id");
  const timestamp =
    request.headers.get("webhook-timestamp") ||
    request.headers.get("svix-timestamp") ||
    request.headers.get("x-webhook-timestamp");
  const signature =
    request.headers.get("webhook-signature") ||
    request.headers.get("svix-signature") ||
    request.headers.get("x-webhook-signature");

  if (!id || !timestamp || !signature) return false;

  const signedPayload = `${id}.${timestamp}.${rawBody}`;
  const expected = createHmac("sha256", standardWebhookSecret(secret))
    .update(signedPayload)
    .digest("base64");

  return parseSignatureValues(signature).some((candidate) => safeCompare(candidate, expected));
}

function hasRawBodySignature(request: Request, rawBody: string, secret: string) {
  const signature =
    request.headers.get("x-yc-signature") ||
    request.headers.get("x-ycloud-signature") ||
    request.headers.get("x-signature-256") ||
    request.headers.get("x-hub-signature-256") ||
    request.headers.get("x-signature");

  if (!signature) return false;

  const expectedHex = createHmac("sha256", secret).update(rawBody).digest("hex");
  const expectedBase64 = createHmac("sha256", secret).update(rawBody).digest("base64");

  return parseSignatureValues(signature).some(
    (candidate) => safeCompare(candidate, expectedHex) || safeCompare(candidate, expectedBase64)
  );
}

function isAuthorized(request: Request, rawBody: string) {
  const ycloudSecret = process.env.YCLOUD_WEBHOOK_SECRET?.trim();
  const internalSecrets = [
    process.env.POLERAFLOW_WEBHOOK_SECRET,
    process.env.N8N_WEBHOOK_SECRET
  ].filter((value): value is string => Boolean(value?.trim()));

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const directSecret =
    request.headers.get("x-poleraflow-webhook-secret") ||
    request.headers.get("x-ycloud-webhook-secret") ||
    request.headers.get("x-webhook-secret");

  if (internalSecrets.some((secret) => bearer === secret || directSecret === secret)) {
    return true;
  }

  if (!ycloudSecret) return true;

  return (
    bearer === ycloudSecret ||
    directSecret === ycloudSecret ||
    hasStandardWebhookSignature(request, rawBody, ycloudSecret) ||
    hasRawBodySignature(request, rawBody, ycloudSecret)
  );
}

type BotWebhookResponse = {
  ok?: boolean;
  replyText?: string;
  replyMessages?: string[];
  replyTargetPhone?: string;
  sendPaymentQr?: boolean;
  payment_flow?: {
    qrUrl?: string | null;
  };
  paymentFlow?: {
    qrUrl?: string | null;
  };
  paymentQrUrl?: string | null;
  duplicate?: boolean;
  error?: string;
};

function shouldTriggerBot(
  event: string,
  message: ReturnType<typeof extractSyncMessage> | null,
  insertedMessage: boolean
) {
  if (!message) return false;
  const normalizedEvent = event.toLowerCase();
  if (message.direction !== "inbound") return false;
  if (normalizedEvent.includes("message.updated")) return false;
  if (normalizedEvent.includes("message_echoes")) return false;
  if (normalizedEvent.includes("history")) return false;
  if (normalizedEvent.includes("state.sync")) return false;
  if (normalizedEvent.includes("status")) return false;

  const isDirectInboundEvent =
    normalizedEvent.includes("inbound") ||
    normalizedEvent.includes("message.received") ||
    !normalizedEvent;

  return insertedMessage || isDirectInboundEvent;
}

function getBotReplyMessages(bot: BotWebhookResponse) {
  if (Array.isArray(bot.replyMessages)) {
    return bot.replyMessages.map((message) => cleanText(message, 1800)).filter(Boolean);
  }

  const fallback = cleanText(bot.replyText, 1800);
  return fallback ? [fallback] : [];
}

function getBotQrUrl(bot: BotWebhookResponse) {
  if (!bot.sendPaymentQr) return "";
  return (
    bot.payment_flow?.qrUrl ||
    bot.paymentFlow?.qrUrl ||
    bot.paymentQrUrl ||
    ""
  );
}

type SyncedYCloudMessage = NonNullable<ReturnType<typeof extractSyncMessage>>;

function buildBotPayload(payload: Record<string, unknown>, message: SyncedYCloudMessage) {
  const attachments = message.attachmentUrl
    ? [
        {
          url: message.attachmentUrl,
          type: message.attachmentType || "file"
        }
      ]
    : [];

  return {
    event: "whatsapp.inbound_message.received",
    timestamp: message.createdAt,
    phone: message.phone,
    from: message.phone,
    customerPhone: message.phone,
    customerName: message.customerName,
    name: message.customerName,
    text: message.body,
    content: message.body,
    messageType: message.attachmentType || "text",
    fromMe: false,
    contact: {
      name: message.customerName,
      phone: message.phone,
      phone_number: message.phone,
      wa_id: message.phone
    },
    message: {
      id: message.providerMessageId,
      text: message.body,
      body: message.body,
      type: message.attachmentType || "text",
      message_type: message.attachmentType || "text",
      from: message.phone,
      fromMe: false,
      direction: "inbound",
      timestamp: message.createdAt,
      attachments
    },
    attachments,
    providerPayload: payload
  };
}

async function runBotAndSendReplies(
  request: Request,
  payload: Record<string, unknown>,
  message: SyncedYCloudMessage
) {
  const phone = message.phone;
  const secret = process.env.N8N_WEBHOOK_SECRET || process.env.POLERAFLOW_WEBHOOK_SECRET;
  if (!secret) return { skipped: true, reason: "missing_n8n_webhook_secret" };

  let bot: BotWebhookResponse | null = null;
  let botStatus = 0;

  try {
    const botUrl = new URL("/api/webhooks/n8n/waflow-bot", request.url);
    const response = await fetch(botUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-poleraflow-webhook-secret": secret,
        "x-poleraflow-skip-incoming-log": "1"
      },
      body: JSON.stringify(buildBotPayload(payload, message))
    });

    botStatus = response.status;
    bot = (await response.json().catch(() => null)) as BotWebhookResponse | null;
    if (!response.ok || !bot?.ok || bot.duplicate) {
      const reason = bot?.duplicate ? "duplicate_bot_event" : bot?.error || response.statusText;
      console.warn("YCloud bot processing skipped or failed.", {
        status: response.status,
        reason,
        phoneSuffix: phone.slice(-4)
      });
      return {
        ok: Boolean(bot?.ok),
        skipped: true,
        reason,
        status: response.status
      };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "bot_request_failed";
    console.error("YCloud bot request failed.", {
      reason,
      phoneSuffix: phone.slice(-4)
    });
    return { ok: false, skipped: true, reason: "bot_request_failed" };
  }

  const messages = getBotReplyMessages(bot);
  const deliveries = [];

  for (const message of messages) {
    const delivery = await sendYCloudTextMessage(bot.replyTargetPhone || phone, message);
    deliveries.push({
      type: "text",
      sent: delivery.sent,
      providerMessageId: delivery.sent ? delivery.providerMessageId : undefined,
      reason: delivery.sent ? undefined : delivery.reason,
      detail: delivery.sent ? undefined : delivery.detail
    });
  }

  const qrUrl = getBotQrUrl(bot);
  if (qrUrl) {
    const delivery = await sendYCloudImageMessage(bot.replyTargetPhone || phone, qrUrl, "QR de pago Nachito Store");
    deliveries.push({
      type: "image",
      sent: delivery.sent,
      providerMessageId: delivery.sent ? delivery.providerMessageId : undefined,
      reason: delivery.sent ? undefined : delivery.reason,
      detail: delivery.sent ? undefined : delivery.detail
    });
  }

  const failedDeliveries = deliveries.filter((delivery) => !delivery.sent);
  if (failedDeliveries.length > 0) {
    console.warn("YCloud bot reply delivery failed.", {
      botStatus,
      phoneSuffix: phone.slice(-4),
      failed: failedDeliveries.map(({ type, reason, detail }) => ({ type, reason, detail }))
    });
  }

  return {
    ok: true,
    sent: deliveries.filter((delivery) => delivery.sent).length,
    failed: deliveries.filter((delivery) => !delivery.sent).length,
    deliveries
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: secureJsonHeaders(request) });
}

export async function POST(request: Request) {
  try {
    assertBodySize(request, 256_000);
    const rawBody = await request.text();

    if (!isAuthorized(request, rawBody)) {
      console.warn("YCloud webhook unauthorized.", {
        hasYCloudSecret: Boolean(process.env.YCLOUD_WEBHOOK_SECRET),
        hasWebhookId: Boolean(request.headers.get("webhook-id") || request.headers.get("svix-id")),
        hasWebhookSignature: Boolean(request.headers.get("webhook-signature") || request.headers.get("svix-signature")),
        hasDirectSecret: Boolean(
          request.headers.get("authorization") ||
          request.headers.get("x-poleraflow-webhook-secret") ||
          request.headers.get("x-ycloud-webhook-secret") ||
          request.headers.get("x-webhook-secret")
        )
      });
      return NextResponse.json(
        { error: "Webhook no autorizado." },
        { status: 401, headers: secureJsonHeaders(request) }
      );
    }

    const payload = asRecord(JSON.parse(rawBody || "{}"));
    if (!payload) {
      return NextResponse.json(
        { error: "Payload invalido." },
        { status: 400, headers: secureJsonHeaders(request) }
      );
    }

    const event = payloadEvent(payload);
    const syncCandidate = extractSyncMessage(payload);
    const syncedMessage = syncCandidate && !isStatusOnlyEvent(event) ? syncCandidate : null;
    if (!syncedMessage) {
      console.warn("YCloud webhook ignored: no syncable message.", {
        event,
        statusOnly: isStatusOnlyEvent(event),
        keys: Object.keys(payload).slice(0, 20)
      });
    }
    const insertedMessage = syncedMessage
      ? await createSyncedProviderMessage({
          ...syncedMessage,
          source: "ycloud"
        })
      : false;
    const botCandidate = syncCandidate && !isStatusOnlyEvent(event) ? syncCandidate : null;
    const shouldRunBot = shouldTriggerBot(event, botCandidate, insertedMessage);
    const botResult = shouldRunBot && syncedMessage
      ? await runBotAndSendReplies(request, payload, syncedMessage)
      : { skipped: true, reason: "not_inbound_new_message" };

    console.info("YCloud webhook processed.", {
      event,
      direction: syncCandidate?.direction,
      insertedMessage,
      shouldRunBot,
      botResult,
      phoneSuffix: syncCandidate?.phone?.slice(-4)
    });

    const message = extractMessagePayload(payload);

    if (!message.messageId || !message.status) {
      return NextResponse.json(
        { ok: true, insertedMessage, ignored: !insertedMessage, reason: "missing_message_status", event, bot: botResult },
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
      { ok: true, updated, insertedMessage, messageId: message.messageId, status: message.status, bot: botResult },
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
