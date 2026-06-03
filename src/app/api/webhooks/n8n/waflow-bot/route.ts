import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAdminClient } from "@/lib/supabase";
import { RequestSecurityError, assertBodySize, cleanText, secureJsonHeaders } from "@/lib/requestSecurity";

const maxBotBodyBytes = 1024 * 1024;
const nachitoStoreUrl = process.env.NACHITO_STORE_URL ?? "https://nachitostore.vercel.app";

type BotStage =
  | "nuevo"
  | "faltan_datos"
  | "esperando_confirmacion"
  | "esperando_tipo_pago"
  | "esperando_comprobante"
  | "comprobante_recibido"
  | "atencion_manual";

interface BotOrder {
  id: string;
  type: "catalogo" | "personalizada";
  product: string;
  color?: string;
  size?: string;
  quantity: number;
  total: number;
  quoteOption?: string;
  details: string;
}

interface BotState {
  stage: BotStage;
  order?: BotOrder;
  paymentChoice?: "50%" | "completo";
  paymentAmount?: number;
  updatedAt?: string;
}

interface BotDecision {
  state: BotState;
  replyText: string;
  needsHuman: boolean;
  botActive?: boolean;
}

interface WaflowPayload {
  account?: {
    id?: string | number;
  };
  conversation?: {
    id?: string | number;
    contact_inbox?: {
      contact_id?: string | number;
    };
  };
  text?: string;
  content?: string;
  messageText?: string;
  message_type?: string;
  phone?: string;
  from?: string;
  customerPhone?: string;
  customerName?: string;
  name?: string;
  fromMe?: boolean;
  messageType?: string;
  type?: string;
  event?: string;
  timestamp?: string | number;
  agencyId?: string;
  locationId?: string;
  slot?: {
    id?: string;
    slotId?: string;
    name?: string;
    phone?: string;
  };
  contact?: {
    id?: string;
    name?: string;
    fullName?: string;
    phone?: string;
    phone_number?: string;
    whatsapp?: string;
    wa_id?: string;
    profile?: {
      name?: string;
    };
  };
  sender?: {
    id?: string | number;
    name?: string;
    phone_number?: string;
    identifier?: string;
  };
  message?: {
    id?: string | number;
    text?: string;
    body?: string;
    content?: string;
    message_type?: string;
    type?: string;
    from?: string;
    fromMe?: boolean;
    direction?: string;
    timestamp?: string | number;
    attachments?: Array<{
      data_url?: string;
      file_url?: string;
      thumb_url?: string;
      url?: string;
    }>;
  };
  attachments?: Array<{
    data_url?: string;
    file_url?: string;
    thumb_url?: string;
    url?: string;
  }>;
  data?: {
    agencyId?: string;
    locationId?: string;
    slot?: WaflowPayload["slot"];
    text?: string;
    contact?: WaflowPayload["contact"];
    message?: WaflowPayload["message"];
  };
  payload?: {
    agencyId?: string;
    locationId?: string;
    slot?: WaflowPayload["slot"];
    text?: string;
    contact?: WaflowPayload["contact"];
    message?: WaflowPayload["message"];
  };
}

function webhookSecret() {
  return process.env.N8N_WEBHOOK_SECRET;
}

function hasValidSecret(request: Request) {
  const secret = webhookSecret();
  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-poleraflow-webhook-secret") ?? "";

  return Boolean(secret && (auth === `Bearer ${secret}` || headerSecret === secret));
}

function normalizePhone(value: unknown) {
  return cleanText(value, 40).replace(/[^\d+]/g, "").slice(0, 24);
}

function safeMoney(value: unknown) {
  const number = Number(value);
  return Math.min(Math.max(0, Number.isFinite(number) ? number : 0), 50_000);
}

function titleCase(value: unknown) {
  const text = cleanText(value, 120);
  if (!text) return undefined;

  return text
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseText(payload: WaflowPayload) {
  const message = payload.message ?? payload.data?.message ?? payload.payload?.message ?? {};

  return cleanText(
    payload.text ??
      payload.content ??
      payload.messageText ??
      message.text ??
      message.body ??
      message.content ??
      payload.data?.text ??
      payload.payload?.text,
    2000
  ).replace(/\s+/g, " ");
}

function parseMessage(payload: WaflowPayload) {
  return payload.message ?? payload.data?.message ?? payload.payload?.message ?? {};
}

function parseAttachmentUrl(payload: WaflowPayload) {
  const message = parseMessage(payload);
  const attachments = payload.attachments ?? message.attachments ?? [];
  const first = Array.isArray(attachments) ? attachments[0] : undefined;

  return cleanText(first?.data_url ?? first?.file_url ?? first?.url ?? first?.thumb_url, 500) || undefined;
}

function parseContact(payload: WaflowPayload) {
  const message = parseMessage(payload);
  const contact = payload.contact ?? payload.data?.contact ?? payload.payload?.contact ?? {};
  const phone = normalizePhone(
    payload.phone ??
      payload.from ??
      payload.customerPhone ??
      payload.sender?.phone_number ??
      payload.sender?.identifier ??
      contact.phone_number ??
      contact.phone ??
      contact.whatsapp ??
      contact.wa_id ??
      message.from
  );

  const name =
    cleanText(payload.customerName ?? payload.name ?? payload.sender?.name ?? contact.name ?? contact.fullName ?? contact.profile?.name, 80) ||
    "Cliente WhatsApp";

  return { name, phone };
}

function parseWaflowContext(payload: WaflowPayload) {
  const contact = payload.contact ?? payload.data?.contact ?? payload.payload?.contact ?? {};
  const slot = payload.slot ?? payload.data?.slot ?? payload.payload?.slot ?? {};

  return {
    waflowContactId:
      cleanText(
        contact.id ?? payload.sender?.id ?? payload.conversation?.contact_inbox?.contact_id,
        80
      ) || undefined,
    waflowLocationId: cleanText(payload.locationId ?? payload.data?.locationId ?? payload.payload?.locationId, 120) || undefined,
    waflowSlotId: cleanText(slot.id ?? slot.slotId, 40) || undefined,
    chatwootConversationId: cleanText(payload.conversation?.id, 80) || undefined
  };
}

function parseTotal(text: string) {
  const matches = [...text.matchAll(/bs\s*(\d+(?:[.,]\d+)?)/gi)].map((match) => Number(match[1].replace(",", ".")));
  return safeMoney(matches.at(-1) ?? 0);
}

function parseQuantity(text: string) {
  const explicit = text.match(/(\d+)\s*x\s+/i)?.[1] ?? text.match(/(\d+)\s*(?:prenda|polera|unidad|u\b)/i)?.[1];
  const quantity = Number(explicit ?? 1);
  return Math.min(Math.max(1, Number.isFinite(quantity) ? Math.round(quantity) : 1), 20);
}

function createOrderId() {
  return `BOT-${Date.now().toString().slice(-8)}`;
}

function parseCatalogLine(text: string) {
  const match = text.match(/(\d+)\s*x\s+(.+?)\s*\(([^,()]+),\s*talla\s+([^)]+)\)\s*-\s*bs\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;

  return {
    quantity: Math.min(Math.max(1, Number(match[1]) || 1), 20),
    product: cleanText(match[2], 120),
    color: titleCase(match[3]),
    size: cleanText(match[4], 20).toUpperCase(),
    unitPrice: safeMoney(match[5].replace(",", "."))
  };
}

function parseOrder(text: string, current?: BotOrder): BotOrder {
  const catalogLine = parseCatalogLine(text);
  const isCustom = /personaliz|cotizar|disen|diseñ|referencia|frente|espalda/i.test(text);
  const color = catalogLine?.color ?? titleCase(text.match(/color:\s*([^.,\n]+)/i)?.[1] ?? text.match(/\b(blanco arena|negro)\b/i)?.[1]);
  const size =
    catalogLine?.size ??
    (cleanText(text.match(/talla:\s*([a-z0-9]+)/i)?.[1] ?? text.match(/\btalla\s*([a-z0-9]+)/i)?.[1], 20).toUpperCase() ||
      undefined);
  const total = parseTotal(text);
  const quantity = catalogLine?.quantity ?? parseQuantity(text);
  const quoteOption = titleCase(text.match(/(solo\s+[^.\n]+|frente\s+[^.\n]+|espalda\s+[^.\n]+)/i)?.[1]);
  const productFromText = cleanText(text.match(/(?:producto|prenda):\s*([^.,\n]+)/i)?.[1], 120);

  return {
    id: current?.id ?? createOrderId(),
    type: isCustom ? "personalizada" : "catalogo",
    product: catalogLine?.product || productFromText || current?.product || (isCustom ? "Polera personalizada" : "Pedido de catalogo"),
    color: color ?? current?.color,
    size: size ?? current?.size,
    quantity: quantity || current?.quantity || 1,
    total: total || (catalogLine ? safeMoney(catalogLine.unitPrice * catalogLine.quantity) : 0) || current?.total || 0,
    quoteOption: quoteOption ?? current?.quoteOption,
    details: text || current?.details || ""
  };
}

function missingFields(order: BotOrder) {
  const missing: string[] = [];
  if (!order.color) missing.push("color");
  if (!order.size) missing.push("talla");
  if (!order.total) missing.push("precio o total");
  if (order.type === "personalizada" && !order.quoteOption) missing.push("ubicacion del diseno");
  return missing;
}

function buildSummary(order: BotOrder) {
  const lines = [
    `Tipo: ${order.type === "personalizada" ? "Personalizada" : "Catalogo"}`,
    `Prenda: ${order.product}`
  ];

  if (order.color) lines.push(`Color: ${order.color}`);
  if (order.size) lines.push(`Talla: ${order.size}`);
  if (order.quoteOption) lines.push(`Diseno: ${order.quoteOption}`);
  lines.push(`Cantidad: ${order.quantity}`);
  lines.push(`Total: ${order.total ? `${order.total} Bs` : "por confirmar"}`);

  return lines.join("\n");
}

function initialState(): BotState {
  return { stage: "nuevo" };
}

function isTextLikeMessage(messageType: string, text: string) {
  const normalizedType = messageType.toLowerCase();
  return Boolean(text) || ["text", "conversation", "extendedtextmessage", "extended_text", "message"].includes(normalizedType);
}

function looksLikeWebOrderMessage(text: string) {
  return /quiero hacer este pedido|total estimado|cliente:|whatsapp:|quiero cotizar una polera personalizada|color:|talla:|subir referencias|\d+\s*x\s+.+\(.+talla.+\)\s*-\s*bs/i.test(
    text
  );
}

function buildStartOnWebsiteReply(customerName: string) {
  return `Hola ${customerName}, soy el asistente de Nachito Store.\n\nPara pedir, entra primero a la web:\n${nachitoStoreUrl}\nAhi eliges catalogo o personalizada.`;
}

function wantsHumanHelp(text: string) {
  return /\b(humano|persona|asesor|vendedor|atencion|atencion manual|hablar con alguien|quiero hablar|ayuda humana|soporte)\b/i.test(text);
}

function normalizeIntentText(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}%\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasAnyPhrase(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function isConfirmationIntent(text: string) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  const negativeFirst = [
    "no esta bien",
    "no esta correcto",
    "no es correcto",
    "no esta perfecto",
    "no quiero",
    "mejor no",
    "cancelar",
    "cancela"
  ];

  if (hasAnyPhrase(normalized, negativeFirst)) return false;

  const exactConfirmations = new Set([
    "si",
    "sii",
    "siii",
    "sip",
    "sep",
    "ok",
    "okay",
    "dale",
    "listo",
    "correcto",
    "confirmo",
    "confirmar",
    "adelante",
    "perfecto",
    "bien"
  ]);

  if (exactConfirmations.has(normalized)) return true;

  return hasAnyPhrase(normalized, [
    "esta perfecto",
    "esta bien",
    "todo bien",
    "todo esta bien",
    "todo esta perfecto",
    "asi esta bien",
    "asi esta perfecto",
    "me parece bien",
    "de acuerdo",
    "dale nomas",
    "dale no mas",
    "si esta bien",
    "si todo",
    "si dale",
    "si confirmo",
    "confirmo el pedido",
    "es correcto",
    "esta correcto"
  ]);
}

function isCancelIntent(text: string) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  const exactCancellations = new Set(["no", "nop", "cancelar", "cancela", "salir", "reiniciar"]);
  if (exactCancellations.has(normalized)) return true;

  return hasAnyPhrase(normalized, [
    "mejor no",
    "no quiero",
    "no gracias",
    "quiero cancelar",
    "cancela el pedido",
    "empezar de nuevo",
    "esta mal",
    "hay error",
    "quiero cambiar",
    "modificar pedido"
  ]);
}

function isHalfPaymentIntent(text: string) {
  const normalized = normalizeIntentText(text);
  return /(^|\s)(50%?|mitad|medio|adelanto|anticipo|media)(\s|$)/i.test(normalized);
}

function isFullPaymentIntent(text: string) {
  const normalized = normalizeIntentText(text);
  return /(^|\s)(completo|completa|todo|total|100%?|pago completo|pagar todo)(\s|$)/i.test(normalized);
}

function buildHumanHandoffReply(customerName: string) {
  return `Listo ${customerName}, te paso con una persona de Nachito Store.`;
}

function humanHelpHint() {
  return "";
}

function splitReplyMessages(replyText: string) {
  return replyText
    .split(/\n{2,}/)
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 8);
}

function recentDuplicateWindow() {
  return new Date(Date.now() - 12_000).toISOString();
}

function stableHash(value: string) {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return (hash >>> 0).toString(16);
}

async function readBotSettings(supabase: SupabaseClient) {
  const { data, error } = await supabase.from("bot_settings").select("key, value");

  if (error || !data) return new Map<string, string>();

  return new Map(data.map((row: { key: string; value: string }) => [row.key, row.value]));
}

function boolSetting(settings: Map<string, string>, key: string, fallback: boolean) {
  const value = settings.get(key);
  if (value === undefined) return fallback;
  return value.toLowerCase() === "true";
}

async function findLatestOpenOrder(supabase: SupabaseClient, phone: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, order_status, payment_status, total")
    .eq("customer_phone", phone)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error || !data) return null;

  return data.find((order: { order_status?: string }) => !["Cancelado", "Entregado"].includes(order.order_status ?? "")) ?? data[0] ?? null;
}

async function logBotEvent(
  supabase: SupabaseClient,
  payload: {
    conversationId: string;
    orderId?: string;
    eventType: string;
    previousStage?: string;
    nextStage?: string;
    data?: Record<string, unknown>;
  }
) {
  await supabase.from("bot_events").insert({
    conversation_id: payload.conversationId,
    order_id: payload.orderId,
    event_type: payload.eventType,
    previous_stage: payload.previousStage,
    next_stage: payload.nextStage,
    payload: payload.data ?? {},
    source: "waflow-bot"
  });
}

async function upsertPaymentRequest(
  supabase: SupabaseClient,
  payload: {
    conversationId: string;
    phone: string;
    state: BotState;
    attachmentUrl?: string;
    settings: Map<string, string>;
  }
) {
  if (!payload.state.paymentChoice || !payload.state.paymentAmount) return null;

  const latestOrder = await findLatestOpenOrder(supabase, payload.phone);
  const provider = payload.settings.get("payment_provider") || process.env.PAYMENT_PROVIDER || "manual_pending_gateway";
  const gatewayEnabled = boolSetting(payload.settings, "payment_gateway_enabled", false);
  const qrUrl = gatewayEnabled ? payload.settings.get("payment_qr_placeholder_url") || null : null;
  const externalReference = `${latestOrder?.order_number ?? payload.conversationId}-${payload.state.paymentChoice}`;

  const query = latestOrder?.id
    ? supabase
        .from("payment_requests")
        .select("id")
        .eq("order_id", latestOrder.id)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle()
    : supabase
        .from("payment_requests")
        .select("id")
        .eq("conversation_id", payload.conversationId)
        .eq("status", "pending")
        .limit(1)
        .maybeSingle();

  const { data: existing } = await query;
  const paymentPayload = {
    order_id: latestOrder?.id ?? null,
    conversation_id: payload.conversationId,
    provider,
    status: payload.attachmentUrl ? "proof_received" : "pending",
    payment_choice: payload.state.paymentChoice,
    amount: payload.state.paymentAmount,
    currency: "BOB",
    qr_url: qrUrl,
    checkout_url: null,
    external_reference: externalReference,
    proof_url: payload.attachmentUrl ?? null,
    verification_payload: {
      gatewayReady: gatewayEnabled,
      source: "waflow-bot",
      order: payload.state.order ?? null
    }
  };

  const result = existing?.id
    ? await supabase.from("payment_requests").update(paymentPayload).eq("id", existing.id).select("id, status, provider, amount, qr_url").single()
    : await supabase.from("payment_requests").insert(paymentPayload).select("id, status, provider, amount, qr_url").single();

  if (latestOrder?.id) {
    await supabase
      .from("orders")
      .update({
        bot_conversation_id: payload.conversationId,
        bot_stage: payload.state.stage,
        payment_choice: payload.state.paymentChoice,
        payment_amount_due: payload.state.paymentAmount,
        payment_provider: provider,
        payment_reference: externalReference,
        payment_qr_url: qrUrl,
        requires_manual_review: payload.state.stage === "comprobante_recibido",
        order_status: payload.state.stage === "comprobante_recibido" ? "Esperando pago" : "Esperando pago"
      })
      .eq("id", latestOrder.id);
  }

  return result.data ?? null;
}

function isOutboundProviderMessage(payload: WaflowPayload) {
  const message = parseMessage(payload);
  const direction = cleanText(
    payload.message?.direction ?? payload.data?.message?.direction ?? payload.payload?.message?.direction,
    40
  ).toLowerCase();
  const messageType = cleanText(payload.message_type ?? message.message_type, 40).toLowerCase();
  const event = cleanText(payload.event, 120).toLowerCase();

  return Boolean(
    payload.message?.fromMe ??
      payload.data?.message?.fromMe ??
      payload.payload?.message?.fromMe ??
      payload.fromMe ??
      false
  ) || ["outbound", "outgoing", "sent"].includes(direction) || messageType === "outgoing" || event.includes("outbound") || event.includes("sent");
}

function buildWebhookEventKey(payload: WaflowPayload, phone: string, text: string, messageType: string) {
  const message = parseMessage(payload);
  const timestamp = cleanText(message.timestamp ?? payload.timestamp ?? message.id, 60);
  const direction = cleanText(message.direction, 40).toLowerCase() || "inbound";
  const slotId = cleanText(payload.slot?.id ?? payload.data?.slot?.id ?? payload.payload?.slot?.id, 60);
  const event = cleanText(payload.event, 120).toLowerCase() || "waflow";
  const body = `${event}|${slotId}|${phone}|${direction}|${timestamp}|${messageType}|${text.toLowerCase()}`;

  return `waflow:${stableHash(body)}`;
}

function nextBotState(state: BotState, text: string, customerName: string, messageType: string) {
  const lower = text.toLowerCase();
  const isTextLike = isTextLikeMessage(messageType, text);
  const hasPaymentProofWords = /comprobante|pagad|pagu[eÃ©]|transfer|deposit/i.test(lower);
  const confirmsOrder = /^(si|s[iÃ­]|confirmo|confirmar|ok|dale|listo|perfecto|de acuerdo|adelante)$/i.test(lower.trim());
  const cancelsOrder = /^(no|cancelar|salir|reiniciar|empezar de nuevo|mejor no)$/i.test(lower.trim());
  let nextState: BotState = { ...state, updatedAt: new Date().toISOString() };
  let replyText = "";
  let needsHuman = false;

  if (cancelsOrder) {
    return {
      state: initialState(),
      replyText: "Entendido, cancelamos el pedido. Si quieres retomarlo, vuelve a enviar tu pedido desde la web o escribe lo que necesitas.",
      needsHuman: false
    };
  }

  if (messageType !== "text" || /comprobante|pagad|pagu[eé]|transfer|deposit/i.test(lower)) {
    nextState = { ...nextState, stage: "comprobante_recibido" };
    replyText = `Recibi tu comprobante, ${customerName}. Lo voy a dejar para revision manual. Apenas se confirme el pago, empezamos con la preparacion de tu polera.`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (/(^|\s)(50%?|mitad|adelanto)(\s|$)/i.test(lower) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total * 0.5) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "50%", paymentAmount };
    replyText = paymentAmount
      ? `Perfecto. Para reservar tu pedido paga el 50%: ${paymentAmount} Bs.\n\nTe mando el QR de pago de Nachito Store. Cuando pagues, envia aqui la foto del comprobante para revisarlo.`
      : "Perfecto, registramos pago del 50%. Primero confirmare el monto exacto y luego te envio el QR de pago.";
    return { state: nextState, replyText, needsHuman };
  }

  if (/(completo|todo|100%?|total)/i.test(lower) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "completo", paymentAmount };
    replyText = paymentAmount
      ? `Perfecto. El pago completo es ${paymentAmount} Bs.\n\nTe mando el QR de pago de Nachito Store. Cuando pagues, envia aqui la foto del comprobante para revisarlo.`
      : "Perfecto, registramos pago completo. Primero confirmare el monto exacto y luego te envio el QR de pago.";
    return { state: nextState, replyText, needsHuman };
  }

  const order = parseOrder(text, state.order);
  const missing = missingFields(order);

  if (missing.length) {
    nextState = { ...nextState, stage: "faltan_datos", order };
    replyText = `Hola ${customerName}, recibi tu mensaje. Para continuar me falta: ${missing.join(", ")}.\n\nResponde esos datos por aqui y te confirmo el resumen del pedido.`;
    return { state: nextState, replyText, needsHuman };
  }

  nextState = { ...nextState, stage: "esperando_tipo_pago", order };
  replyText = `Hola ${customerName}, ya tengo tu pedido:\n\n${buildSummary(order)}\n\nPara avanzar puedes pagar el 50% de adelanto o el pago completo. Responde: 50% o completo.`;

  return { state: nextState, replyText, needsHuman };
}

function nextBotStateV2(state: BotState, text: string, customerName: string, messageType: string): BotDecision {
  const lower = text.toLowerCase();
  const isTextLike = isTextLikeMessage(messageType, text);
  const hasPaymentProofWords = /comprobante|pagad|pagu|transfer|deposit/i.test(lower);
  const confirmsOrder = isConfirmationIntent(text);
  const cancelsOrder = isCancelIntent(text);
  let nextState: BotState = { ...state, updatedAt: new Date().toISOString() };
  let replyText = "";
  let needsHuman = false;

  if (cancelsOrder) {
    return {
      state: initialState(),
      replyText: `Entendido ${customerName}, cancelamos este flujo.\n\nPara empezar de nuevo, envia tu pedido desde la web.\n\nSi necesitas ayuda, responde HUMANO.`,
      needsHuman: false
    };
  }

  if (wantsHumanHelp(text)) {
    nextState = { ...nextState, stage: "atencion_manual" };
    return {
      state: nextState,
      replyText: buildHumanHandoffReply(customerName),
      needsHuman: true,
      botActive: false
    };
  }

  if ((state.stage === "esperando_comprobante" && !isTextLike) || hasPaymentProofWords) {
    nextState = { ...nextState, stage: "comprobante_recibido" };
    replyText = `Recibi tu comprobante, ${customerName}.\n\nLo dejo en revision.\n\nCuando se confirme, tu pedido pasa a preparacion.`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (!isTextLike) {
    nextState = { ...nextState, stage: "atencion_manual" };
    replyText = `Recibi tu archivo, ${customerName}.\n\nLo dejo para revision manual.`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  const stateStartedFromWeb = Boolean(state.order?.details && looksLikeWebOrderMessage(state.order.details));
  if (!looksLikeWebOrderMessage(text) && (!state.order || !stateStartedFromWeb)) {
    nextState = { stage: "nuevo", updatedAt: new Date().toISOString() };
    replyText = buildStartOnWebsiteReply(customerName);
    return { state: nextState, replyText, needsHuman };
  }

  if (state.stage === "esperando_confirmacion" && state.order) {
    if (!confirmsOrder) {
      replyText = `Te confirmo el resumen:\n\n${buildSummary(state.order)}\n\nSi esta bien, dime algo como "si", "dale" o "esta perfecto".`;
      return { state: nextState, replyText, needsHuman };
    }

    nextState = { ...nextState, stage: "esperando_tipo_pago" };
    const half = state.order.total ? safeMoney(state.order.total * 0.5) : 0;
    replyText = `Pedido confirmado.\n\nComo quieres pagar?\n\n50%: ${half} Bs\nCompleto: ${state.order.total} Bs`;
    return { state: nextState, replyText, needsHuman };
  }

  if (isHalfPaymentIntent(text) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total * 0.5) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "50%", paymentAmount };
    replyText = paymentAmount
      ? `Perfecto. El adelanto es ${paymentAmount} Bs.\n\nTe pasaremos el QR para pagar.\n\nCuando pagues, envia el comprobante.`
      : `Perfecto. Revisamos el monto y te pasamos el QR.${humanHelpHint()}`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (isFullPaymentIntent(text) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "completo", paymentAmount };
    replyText = paymentAmount
      ? `Perfecto. El total es ${paymentAmount} Bs.\n\nTe pasaremos el QR para pagar.\n\nCuando pagues, envia el comprobante.`
      : `Perfecto. Revisamos el monto y te pasamos el QR.${humanHelpHint()}`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (state.stage === "esperando_tipo_pago" && state.order) {
    replyText = `Elige una opcion para seguir:\n\n50%: adelanto\nCompleto: todo el monto`;
    return { state: nextState, replyText, needsHuman };
  }

  const order = parseOrder(text, state.order);
  const missing = missingFields(order);

  if (missing.length) {
    nextState = { ...nextState, stage: "faltan_datos", order };
    replyText = `Ya recibi tu mensaje, ${customerName}.\n\nMe falta: ${missing.join(", ")}.\n\nResponde esos datos para continuar.${humanHelpHint()}`;
    return { state: nextState, replyText, needsHuman };
  }

  nextState = { ...nextState, stage: "esperando_confirmacion", order };
  replyText = `Ya tengo tu pedido:\n\n${buildSummary(order)}\n\nConfirmas si todo esta bien?`;

  return { state: nextState, replyText, needsHuman };
}

export async function POST(request: Request) {
  try {
    assertBodySize(request, maxBotBodyBytes);

    if (!webhookSecret()) {
      throw new RequestSecurityError("N8N_WEBHOOK_SECRET no esta configurado.", 503);
    }

    if (!hasValidSecret(request)) {
      throw new RequestSecurityError("Webhook no autorizado.", 401);
    }

    const payload = (await request.json()) as WaflowPayload;
    const text = parseText(payload);
    const payloadMessage = parseMessage(payload);
    const messageType =
      cleanText(
        payloadMessage.type ?? payloadMessage.message_type ?? payload.message_type ?? payload.messageType ?? payload.type,
        40
      ) || "text";
    const fromMe = isOutboundProviderMessage(payload);
    const { name, phone } = parseContact(payload);
    const waflowContext = parseWaflowContext(payload);
    const attachmentUrl = parseAttachmentUrl(payload);

    if (!phone) {
      throw new RequestSecurityError("Falta telefono del cliente.", 400);
    }

    const supabase = requireSupabaseAdminClient();
    const settings = await readBotSettings(supabase);
    const botGlobalActive = boolSetting(settings, "bot_global_active", true);
    const inboundBody = text || `[${messageType}]`;
    const eventKey = buildWebhookEventKey(payload, phone, inboundBody, messageType);
    const { error: eventInsertError } = await supabase.from("webhook_events").insert({
      event_key: eventKey,
      provider: "waflow"
    });

    if (eventInsertError?.code === "23505") {
      return NextResponse.json(
        { ok: true, replyText: "", replyMessages: [], duplicate: true, needsHuman: false },
        { headers: secureJsonHeaders(request) }
      );
    }

    if (eventInsertError) throw eventInsertError;

    const { data: existingConversation, error: readConversationError } = await supabase
      .from("conversations")
      .select("id, customer_name, phone, bot_active, status")
      .eq("phone", phone)
      .maybeSingle();

    if (readConversationError) throw readConversationError;

    let conversation = existingConversation;
    if (!conversation) {
      const { data: createdConversation, error: createConversationError } = await supabase
        .from("conversations")
        .insert({
          customer_name: name,
          phone,
          bot_active: true,
          status: "nuevo",
          bot_stage: "nuevo",
          waflow_contact_id: waflowContext.waflowContactId,
          waflow_location_id: waflowContext.waflowLocationId,
          chatwoot_conversation_id: waflowContext.chatwootConversationId,
          last_inbound_message_id: cleanText(payloadMessage.id, 120) || eventKey,
          last_message_at: new Date().toISOString()
        })
        .select("id, customer_name, phone, bot_active, status")
        .single();

      if (createConversationError) throw createConversationError;
      conversation = createdConversation;
    }

    const { data: duplicateInbound, error: duplicateInboundError } = await supabase
      .from("messages")
      .select("id")
      .eq("conversation_id", conversation.id)
      .eq("direction", "inbound")
      .eq("source", "waflow")
      .eq("body", inboundBody)
      .gte("created_at", recentDuplicateWindow())
      .limit(1)
      .maybeSingle();

    if (duplicateInboundError) throw duplicateInboundError;

    if (duplicateInbound) {
      return NextResponse.json(
        { ok: true, replyText: "", replyMessages: [], stage: conversation.status, duplicate: true, needsHuman: false },
        { headers: secureJsonHeaders(request) }
      );
    }

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: fromMe ? "outbound" : "inbound",
      body: inboundBody,
      source: "waflow",
      metadata: { raw: payload, attachmentUrl }
    });

    if (!botGlobalActive || !conversation.bot_active || fromMe) {
      return NextResponse.json(
        { ok: true, replyText: "", stage: conversation.status, needsHuman: true },
        { headers: secureJsonHeaders(request) }
      );
    }

    const { data: latestStateMessage, error: latestStateError } = await supabase
      .from("messages")
      .select("metadata")
      .eq("conversation_id", conversation.id)
      .not("metadata->botState", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestStateError) throw latestStateError;

    const currentState = ((latestStateMessage?.metadata as { botState?: BotState } | null)?.botState ?? initialState()) as BotState;
    const previousStage = currentState.stage;
    const { state, replyText, needsHuman, botActive } = nextBotStateV2(currentState, text, name, messageType);
    const replyMessages = splitReplyMessages(replyText);
    const paymentRequest = await upsertPaymentRequest(supabase, {
      conversationId: conversation.id,
      phone,
      state,
      attachmentUrl,
      settings
    });

    await logBotEvent(supabase, {
      conversationId: conversation.id,
      orderId: undefined,
      eventType: paymentRequest ? "payment_request_updated" : "bot_stage_changed",
      previousStage,
      nextStage: state.stage,
      data: {
        paymentRequest,
        paymentChoice: state.paymentChoice,
        paymentAmount: state.paymentAmount,
        needsHuman,
        messageType,
        hasAttachment: Boolean(attachmentUrl)
      }
    });

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: "outbound",
      body: replyText,
      source: "bot",
      metadata: {
        botState: state,
        needsHuman
      }
    });

    const conversationUpdate: Record<string, unknown> = {
      customer_name: name,
      status: state.stage,
      bot_stage: state.stage,
      waflow_contact_id: waflowContext.waflowContactId,
      waflow_location_id: waflowContext.waflowLocationId,
      chatwoot_conversation_id: waflowContext.chatwootConversationId,
      last_inbound_message_id: cleanText(payloadMessage.id, 120) || eventKey,
      payment_flow: {
        paymentChoice: state.paymentChoice,
        paymentAmount: state.paymentAmount,
        paymentRequestId: paymentRequest?.id,
        provider: paymentRequest?.provider,
        qrUrl: paymentRequest?.qr_url
      },
      last_message_at: new Date().toISOString()
    };

    if (typeof botActive === "boolean") {
      conversationUpdate.bot_active = botActive;
    }

    await supabase
      .from("conversations")
      .update(conversationUpdate)
      .eq("id", conversation.id);

    return NextResponse.json(
      {
        ok: true,
        replyText,
        stage: state.stage,
        conversationId: conversation.id,
        order: state.order ?? null,
        replyMessages,
        replyTargetPhone: phone,
        ...waflowContext,
        paymentChoice: state.paymentChoice,
        paymentAmount: state.paymentAmount,
        paymentRequest,
        botActive,
        needsHuman
      },
      { headers: secureJsonHeaders(request) }
    );
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo procesar el bot de Waflow.";

    return NextResponse.json({ ok: false, error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
