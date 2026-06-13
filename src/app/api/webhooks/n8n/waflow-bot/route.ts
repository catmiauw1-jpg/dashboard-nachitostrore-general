import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateOrder } from "@/lib/orderRepository";
import { type PaymentProofEvidence, parseProofEvidence, sameMoney } from "@/lib/paymentVerification";
import { requireSupabaseAdminClient } from "@/lib/supabase";
import { RequestSecurityError, assertBodySize, cleanText, secureJsonHeaders } from "@/lib/requestSecurity";

const maxBotBodyBytes = 1024 * 1024;
const nachitoStoreUrl = process.env.NACHITO_STORE_URL ?? "https://nachitostore.vercel.app";
const poleraFlowPublicUrl = process.env.POLERAFLOW_PUBLIC_URL ?? "https://admin-dhasboard.vercel.app";
const manualPaymentQrUrl = process.env.MANUAL_PAYMENT_QR_URL ?? `${poleraFlowPublicUrl}/payment/mercantil-qr.jpeg`;

type BotStage =
  | "nuevo"
  | "faltan_datos"
  | "esperando_confirmacion"
  | "esperando_ubicacion"
  | "esperando_departamento"
  | "esperando_tipo_pago"
  | "esperando_comprobante"
  | "comprobante_recibido"
  | "atencion_manual";

interface BotOrder {
  id: string;
  type: "catalogo" | "personalizada";
  product: string;
  customerName?: string;
  customerPhone?: string;
  color?: string;
  size?: string;
  quantity: number;
  total: number;
  quoteOption?: string;
  details: string;
  items?: BotOrderItem[];
}

interface BotOrderItem {
  product: string;
  color?: string;
  size?: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
}

interface BotState {
  stage: BotStage;
  order?: BotOrder;
  deliveryArea?: "santa_cruz" | "otro_departamento";
  deliveryDepartment?: string;
  paymentChoice?: "50%" | "completo";
  paymentAmount?: number;
  lastPrompt?: string;
  lastPromptAt?: string;
  updatedAt?: string;
}

interface BotDecision {
  state: BotState;
  replyText: string;
  needsHuman: boolean;
  botActive?: boolean;
  cancelOpenOrder?: boolean;
  cancelReason?: string;
  sendPaymentQr?: boolean;
}

type CustomerIntent =
  | "web_order"
  | "confirm"
  | "cancel"
  | "change"
  | "fresh_order"
  | "human"
  | "half_payment"
  | "full_payment"
  | "payment_proof"
  | "no_order_claim"
  | "greeting"
  | "faq"
  | "unknown";

interface AiIntentPayload {
  intent?: CustomerIntent;
  confidence?: number;
  reason?: string;
  normalizedText?: string;
  safeToUse?: boolean;
  paymentChoice?: "50%" | "completo" | null;
  deliveryZone?: "santa_cruz" | "otro_departamento" | null;
  department?: string | null;
  suggestedReply?: string;
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
  aiIntent?: AiIntentPayload;
  ai_intent?: AiIntentPayload;
  ai?: {
    intent?: AiIntentPayload | CustomerIntent;
    confidence?: number;
    safeToUse?: boolean;
    reason?: string;
  };
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
      link?: string;
      id?: string | number;
      type?: string;
      mime_type?: string;
      mimeType?: string;
      file_name?: string;
      filename?: string;
      name?: string;
    }>;
    image?: {
      url?: string;
      link?: string;
      id?: string | number;
      mime_type?: string;
      mimeType?: string;
      caption?: string;
    };
    document?: {
      url?: string;
      link?: string;
      id?: string | number;
      mime_type?: string;
      mimeType?: string;
      file_name?: string;
      filename?: string;
      name?: string;
      caption?: string;
    };
  };
  attachments?: Array<{
    data_url?: string;
    file_url?: string;
    thumb_url?: string;
    url?: string;
    link?: string;
    id?: string | number;
    type?: string;
    mime_type?: string;
    mimeType?: string;
    file_name?: string;
    filename?: string;
    name?: string;
  }>;
  data?: {
    agencyId?: string;
    locationId?: string;
    slot?: WaflowPayload["slot"];
    text?: string;
    contact?: WaflowPayload["contact"];
    message?: WaflowPayload["message"];
    proofText?: string;
    ocrText?: string;
  };
  payload?: {
    agencyId?: string;
    locationId?: string;
    slot?: WaflowPayload["slot"];
    text?: string;
    contact?: WaflowPayload["contact"];
    message?: WaflowPayload["message"];
    proofText?: string;
    ocrText?: string;
  };
  proofText?: string;
  ocrText?: string;
  proofEvidence?: PaymentProofEvidence & {
    bankName?: string;
    paidAtText?: string;
    confidence?: number;
    warnings?: string[];
  };
  caption?: string;
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
  return cleanText(value, 40).replace(/\D/g, "").slice(0, 24);
}

function phoneLookupVariants(phone: string) {
  const normalized = normalizePhone(phone);
  const variants = new Set<string>();
  if (normalized) variants.add(normalized);
  if (normalized.startsWith("591") && normalized.length > 8) variants.add(normalized.slice(3));
  if (normalized.length === 8) variants.add(`591${normalized}`);
  return [...variants];
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

function isGenericCustomerName(value: unknown) {
  const normalized = normalizeIntentText(cleanText(value, 80));
  return !normalized || ["cliente whatsapp", "cliente web", "cliente", "whatsapp", "web"].includes(normalized);
}

function resolveCustomerName(existingName: unknown, contactName: unknown, state?: Pick<BotState, "order">) {
  const orderName = cleanText(state?.order?.customerName, 80);
  const current = cleanText(existingName, 80);
  const contact = cleanText(contactName, 80);

  if (orderName && !isGenericCustomerName(orderName)) return orderName;
  if (current && !isGenericCustomerName(current)) return current;
  if (contact && !isGenericCustomerName(contact)) return contact;

  return orderName || current || contact || "Cliente WhatsApp";
}

function parseText(payload: WaflowPayload) {
  const message = payload.message ?? payload.data?.message ?? payload.payload?.message ?? {};

  const text = cleanText(
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

  return stripProviderTextSuffix(text);
}

function parseMessage(payload: WaflowPayload) {
  return payload.message ?? payload.data?.message ?? payload.payload?.message ?? {};
}

function parseAttachmentUrl(payload: WaflowPayload) {
  return parseAttachmentDetails(payload).url;
}

function parseAttachmentDetails(payload: WaflowPayload) {
  const message = parseMessage(payload);
  const attachments = payload.attachments ?? message.attachments ?? [];
  const first = Array.isArray(attachments) ? attachments[0] : undefined;
  const directImage = message.image;
  const directDocument = message.document;
  const direct = directImage ?? directDocument;

  return {
    url: cleanText(first?.data_url ?? first?.file_url ?? first?.url ?? first?.link ?? first?.thumb_url ?? direct?.url ?? direct?.link, 500) || undefined,
    mediaId: cleanText(first?.id ?? direct?.id, 120) || undefined,
    type: cleanText(first?.type ?? (directImage ? "image" : undefined) ?? (directDocument ? "document" : undefined) ?? message.type ?? message.message_type ?? payload.messageType ?? payload.type, 60) || undefined,
    mimeType: cleanText(first?.mime_type ?? first?.mimeType ?? direct?.mime_type ?? direct?.mimeType, 120) || undefined,
    fileName: cleanText(first?.file_name ?? first?.filename ?? first?.name ?? directDocument?.file_name ?? directDocument?.filename ?? directDocument?.name, 180) || undefined
  };
}

function parseProofText(payload: WaflowPayload, text: string) {
  const message = parseMessage(payload);
  return cleanText(
    payload.proofText ??
      payload.ocrText ??
      payload.data?.proofText ??
      payload.data?.ocrText ??
      payload.payload?.proofText ??
      payload.payload?.ocrText ??
      payload.caption ??
      message.content ??
      text,
    6000
  );
}

function parseIncomingProofEvidence(payload: WaflowPayload, text: string) {
  const parsedFromText = parseProofEvidence(text);
  const incoming = payload.proofEvidence ?? {};

  return {
    ...parsedFromText,
    ...incoming,
    amount: incoming.amount !== undefined ? Number(incoming.amount) : parsedFromText.amount,
    payerName: cleanText(incoming.payerName, 160) || parsedFromText.payerName,
    reference: cleanText(incoming.reference, 80) || parsedFromText.reference,
    notificationNumber: cleanText(incoming.notificationNumber, 80) || parsedFromText.notificationNumber,
    rawText: cleanText(incoming.rawText, 6000) || parsedFromText.rawText,
    bankName: cleanText(incoming.bankName, 120) || undefined,
    paidAtText: cleanText(incoming.paidAtText, 120) || undefined,
    confidence: incoming.confidence !== undefined ? Math.max(0, Math.min(1, Number(incoming.confidence))) : undefined,
    warnings: Array.isArray(incoming.warnings) ? incoming.warnings.map((warning) => cleanText(warning, 160)).filter(Boolean) : []
  };
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
    lineTotal: safeMoney(match[5].replace(",", "."))
  };
}

function parseCatalogItems(text: string): BotOrderItem[] {
  const items: BotOrderItem[] = [];
  const pattern = /(\d+)\s*x\s+(.+?)\s*\(([^,()]+),\s*talla\s+([^)]+)\)(?:\s*-\s*bs\s*(\d+(?:[.,]\d+)?))?/gi;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const quantity = Math.min(Math.max(1, Number(match[1]) || 1), 20);
    const lineTotal = match[5] ? safeMoney(match[5].replace(",", ".")) : undefined;
    items.push({
      quantity,
      product: cleanText(match[2], 120),
      color: titleCase(match[3]),
      size: cleanText(match[4], 20).toUpperCase(),
      unitPrice: lineTotal ? safeMoney(lineTotal / quantity) : undefined,
      lineTotal
    });
  }

  return items;
}

function parseOrder(text: string, current?: BotOrder): BotOrder {
  const catalogItems = parseCatalogItems(text);
  const catalogLine = catalogItems[0] ?? parseCatalogLine(text);
  const isCustom = /personaliz|cotizar|disen|diseñ|referencia|frente|espalda/i.test(text);
  const customerName = titleCase(text.match(/cliente:\s*([^.\n,]+)/i)?.[1]) ?? current?.customerName;
  const customerPhone = normalizePhone(text.match(/whatsapp:\s*([+\d\s().-]+)/i)?.[1]) || current?.customerPhone;
  const color = catalogLine?.color ?? titleCase(text.match(/color:\s*([^.,\n]+)/i)?.[1] ?? text.match(/\b(blanco arena|negro)\b/i)?.[1]);
  const size =
    catalogLine?.size ??
    (cleanText(text.match(/talla:\s*([a-z0-9]+)/i)?.[1] ?? text.match(/\btalla\s*([a-z0-9]+)/i)?.[1], 20).toUpperCase() ||
      undefined);
  const total = parseTotal(text);
  const quantity = catalogItems.length ? catalogItems.reduce((sum, item) => sum + item.quantity, 0) : catalogLine?.quantity ?? parseQuantity(text);
  const quoteOption = titleCase(text.match(/(solo\s+[^.\n]+|frente\s+[^.\n]+|espalda\s+[^.\n]+)/i)?.[1]);
  const productFromText = cleanText(text.match(/(?:producto|prenda):\s*([^.,\n]+)/i)?.[1], 120);

  return {
    id: current?.id ?? createOrderId(),
    type: isCustom ? "personalizada" : "catalogo",
    product: catalogLine?.product || productFromText || current?.product || (isCustom ? "Polera personalizada" : "Pedido de catalogo"),
    customerName,
    customerPhone,
    color: color ?? current?.color,
    size: size ?? current?.size,
    quantity: quantity || current?.quantity || 1,
    total:
      total ||
      (catalogItems.length ? safeMoney(catalogItems.reduce((sum, item) => sum + (item.lineTotal ?? 0), 0)) : 0) ||
      (catalogLine?.lineTotal ? safeMoney(catalogLine.lineTotal) : 0) ||
      current?.total ||
      0,
    quoteOption: quoteOption ?? current?.quoteOption,
    details: text || current?.details || "",
    items: catalogItems.length ? catalogItems : current?.items
  };
}

function missingFields(order: BotOrder) {
  const missing: string[] = [];
  const hasCatalogItems = Boolean(order.items?.length);
  if (!hasCatalogItems && !order.color) missing.push("color");
  if (!hasCatalogItems && !order.size) missing.push("talla");
  if (!order.total) missing.push("precio o total");
  if (order.type === "personalizada" && !order.quoteOption) missing.push("ubicacion del diseno");
  return missing;
}

function buildSummary(order: BotOrder) {
  const lines = [
    `Tipo: ${order.type === "personalizada" ? "Personalizada" : "Catalogo"}`
  ];

  if (order.items?.length) {
    lines.push("Prendas:");
    order.items.forEach((item, index) => {
      const variant = [item.color, item.size ? `talla ${item.size}` : ""].filter(Boolean).join(", ");
      const price = item.lineTotal ? ` — Bs ${item.lineTotal}` : "";
      lines.push(`  ${index + 1}. ${item.quantity}x ${item.product}${variant ? ` (${variant})` : ""}${price}`);
    });
  } else {
    lines.push("Prendas:");
    const variant = [order.color, order.size ? `talla ${order.size}` : ""].filter(Boolean).join(", ");
    lines.push(`  1. ${order.quantity}x ${order.product}${variant ? ` (${variant})` : ""} — Bs ${order.total || "por confirmar"}`);
  }

  if (order.quoteOption) lines.push(`Diseno: ${order.quoteOption}`);
  lines.push(`Cantidad total: ${order.quantity}`);
  lines.push(`*Total: ${order.total ? `${order.total} Bs` : "por confirmar"}*`);

  return lines.join("\n");
}

function buildOrderConfirmationMessage(order: BotOrder) {
  return `📋 *Pedido nuevo:*\n${buildSummary(order)}\n\n¿Confirmas? Responde *SI* o *NO*`;
}

function buildLocationQuestionReply() {
  return `¿Desde dónde nos escribes?\n*1* → Santa Cruz\n*2* → Otro departamento`;
}

function buildDepartmentQuestionReply() {
  return "¿A qué departamento necesitas el envío?";
}

function buildPaymentChoiceReply(order: BotOrder, state?: BotState) {
  const half = order.total ? safeMoney(order.total * 0.5) : 0;
  const delivery =
    state?.deliveryArea === "otro_departamento"
      ? `Perfecto. Los envíos a *${state.deliveryDepartment ?? "tu departamento"}* se realizan los *jueves y viernes* por flota. 📦\nEl costo es adicional a tu cargo.`
      : "Perfecto. Cuando tu pedido esté listo te lo enviamos por *Yango* 🛵 o puedes *pasar a recogerlo*.";

  return `${delivery}\n\n💳 ¿Cómo quieres pagar?\n*1* → 50% ahora: ${half} Bs\n*2* → Completo: ${order.total} Bs`;
}

function buildPaymentInstructionReply(kind: "50%" | "completo", amount: number) {
  return `Perfecto. Monto a transferir: *${amount} Bs*\n\nCuando realices el pago, *envía tu comprobante* por aquí. 📎`;
}

function buildProofReviewReply() {
  return "📎 Comprobante recibido, ¡gracias! 🙌\n\n⏳ *En revisión...*\nUna vez confirmado el pago, iniciamos la preparación.\nTe avisamos enseguida.";
}

function buildPaymentConfirmedReply(customerName: string) {
  return `✅ *Pago confirmado. ¡Tu pedido entra a producción!* 🎉\nTu polera estará lista en *2 a 4 días hábiles.*\nTe avisamos cuando esté lista. 👕`;
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

function stripProviderTextSuffix(text: string) {
  return text.replace(/\s+source:\s*nachitostore\s*$/i, "").trim();
}

function isFreshWebOrderMessage(text: string, state: BotState) {
  if (!looksLikeWebOrderMessage(text)) return false;

  const incoming = normalizeIntentText(stripProviderTextSuffix(text));
  const current = normalizeIntentText(stripProviderTextSuffix(state.order?.details ?? ""));

  return Boolean(incoming && incoming !== current);
}

function buildStartOnWebsiteReply(customerName: string) {
  return `¡Hola! 👋 Bienvenido/a a *Nachito Store* 🛍️\n\nPara hacer tu pedido, entra a nuestra web:\n👉 ${nachitoStoreUrl}\nAhí eliges catálogo o personalizada.\nCuando termines, toca *"Ir a pagar por WhatsApp"* 🛒`;
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

function intentWords(text: string) {
  return normalizeIntentText(text).split(" ").filter(Boolean);
}

function editDistance(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const distances = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) distances[row][0] = row;
  for (let col = 0; col < cols; col += 1) distances[0][col] = col;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      distances[row][col] = Math.min(
        distances[row - 1][col] + 1,
        distances[row][col - 1] + 1,
        distances[row - 1][col - 1] + cost
      );
    }
  }

  return distances[a.length][b.length];
}

function hasApproxWord(text: string, targets: string[]) {
  const words = intentWords(text);
  return targets.some((target) =>
    words.some((word) => {
      if (word === target || word.startsWith(target) || target.startsWith(word)) return true;
      const maxDistance = target.length <= 5 ? 1 : 2;
      return Math.abs(word.length - target.length) <= maxDistance && editDistance(word, target) <= maxDistance;
    })
  );
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

  const exactCancellations = new Set([
    "no",
    "nop",
    "cancelar",
    "cancela",
    "cancelalo",
    "cancelarlo",
    "cancelamela",
    "cancelamelo",
    "anular",
    "salir",
    "reiniciar"
  ]);
  if (exactCancellations.has(normalized)) return true;
  if (/^(cancelar|cancela|cancelalo|cancelarlo|anular|borra|borrar)\b/.test(normalized)) return true;

  return hasAnyPhrase(normalized, [
    "mejor no",
    "no quiero",
    "no gracias",
    "no era ese",
    "no es ese",
    "no es lo que pedi",
    "no esta bien",
    "no esta correcto",
    "no es correcto",
    "ya no quiero",
    "ya no lo quiero",
    "dejalo nomas",
    "dejalo no mas",
    "deja nomas",
    "borra el pedido",
    "anula el pedido",
    "anular pedido",
    "quiero cancelar",
    "quiero cancelarlo",
    "lo quiero cancelar",
    "cancelar pedido",
    "cancela pedido",
    "cancela el pedido",
    "cancela mi pedido",
    "cancelar mi pedido",
    "cancelar el pedido",
    "cancelarlo",
    "cancelarlo por favor",
    "cancelalo por favor",
    "cancelamelo",
    "cancelamela",
    "cancelo pedido",
    "empezar de nuevo",
    "esta mal",
    "hay error",
    "quiero cambiar",
    "modificar pedido"
  ]);
}

function isNoOrderClaimIntent(text: string) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  return hasAnyPhrase(normalized, [
    "no tengo pedido",
    "no tengo ningun pedido",
    "no hice pedido",
    "yo no pedi",
    "yo no pedi nada",
    "no pedi nada",
    "no tengo nada",
    "no tengo pedido pendiente",
    "no es mi pedido",
    "ese pedido no es mio"
  ]);
}

function isHalfPaymentIntent(text: string, state?: BotState) {
  const normalized = normalizeIntentText(text);
  if (state?.stage === "esperando_tipo_pago" && normalized === "1") return true;
  return /(^|\s)(50%?|mitad|medio|adelanto|anticipo|media)(\s|$)/i.test(normalized);
}

function isFullPaymentIntent(text: string, state?: BotState) {
  const normalized = normalizeIntentText(text);
  if (state?.stage === "esperando_tipo_pago" && normalized === "2") return true;
  return /(^|\s)(completo|completa|todo|total|100%?|pago completo|pagar todo)(\s|$)/i.test(normalized);
}

function isSantaCruzIntent(text: string) {
  const normalized = normalizeIntentText(text);
  return normalized === "1" || normalized === "santa cruz" || normalized === "scz" || normalized === "santa";
}

function isOtherDepartmentIntent(text: string) {
  const normalized = normalizeIntentText(text);
  return normalized === "2" || hasAnyPhrase(normalized, ["otro departamento", "otro depto", "flota", "fuera de santa cruz"]);
}

function parseDepartmentName(text: string) {
  const normalized = cleanText(text, 80).replace(/^\s*(departamento|depto|soy de|en|a)\s+/i, "").trim();
  if (!normalized || ["1", "2"].includes(normalized)) return "";
  return titleCase(normalized) ?? "";
}

function isGreetingIntent(text: string) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  const greetings = new Set(["hola", "buenas", "buen dia", "buenas tardes", "buenas noches", "hey", "ola"]);
  return greetings.has(normalized) || /^(hola|buenas|buen dia|buenas tardes|buenas noches)\b/.test(normalized);
}

function isNewOrderRequestIntent(text: string) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  return hasAnyPhrase(normalized, [
    "quiero hacer un pedido",
    "quisiera hacer un pedido",
    "quiero pedir",
    "quiero comprar",
    "hacer pedido",
    "nuevo pedido",
    "pedido nuevo",
    "otra polera",
    "otra prenda",
    "cotizar otra",
    "quiero cotizar"
  ]);
}

function isFreshOrderResetIntent(text: string) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  if (hasAnyPhrase(normalized, [
    "nuevo pedido",
    "pedido nuevo",
    "hacer otro pedido",
    "hacer un nuevo pedido",
    "quiero otro pedido",
    "quisiera otro pedido",
    "quiero hacer otro",
    "quiero hacer uno nuevo",
    "quiero un nuevo",
    "quisiera un nuevo",
    "un nuevo pedido",
    "otro pedido",
    "otro pedidos",
    "quiero pedir otra",
    "quiero pedir otro",
    "empezar otro",
    "empezar de nuevo",
    "volver a pedir"
  ])) {
    return true;
  }

  const mentionsOrder = hasAnyPhrase(normalized, ["pedido", "pedir", "comprar", "cotizar", "polera", "prenda"]);
  const wantsAnother = hasApproxWord(normalized, ["otro", "otra", "nuevo", "nueva"]);
  const action = hasAnyPhrase(normalized, ["quiero", "quisiera", "hacer", "armar", "empezar", "volver"]);

  return mentionsOrder && wantsAnother && action;
}

function isOrderChangeIntent(text: string) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return false;

  return hasAnyPhrase(normalized, [
    "quiero cambiar",
    "cambiar pedido",
    "modificar pedido",
    "me equivoque",
    "esta mal",
    "no esta bien",
    "no esta correcto",
    "no es correcto",
    "no es ese",
    "no era ese",
    "me confundi",
    "otro color",
    "otra talla",
    "otra prenda",
    "cambiar talla",
    "cambiar color"
  ]);
}

function detectCustomerIntent(text: string, state: BotState, messageType: string, hasAttachment: boolean): CustomerIntent {
  const lower = text.toLowerCase();
  const isTextLike = isTextLikeMessage(messageType, text);
  const hasPaymentProofWords = /comprobante|pagad|pagu|transfer|deposit/i.test(lower);

  if (looksLikeWebOrderMessage(text)) return "web_order";
  if (wantsHumanHelp(text)) return "human";
  if (state.order && isNoOrderClaimIntent(text)) return "no_order_claim";
  if (state.order && isFreshOrderResetIntent(text)) return "fresh_order";
  if (state.order && isOrderChangeIntent(text)) return "change";
  if (isCancelIntent(text)) return "cancel";
  if (isConfirmationIntent(text)) return "confirm";
  if (isHalfPaymentIntent(text, state)) return "half_payment";
  if (isFullPaymentIntent(text, state)) return "full_payment";
  if ((state.stage === "esperando_comprobante" && (!isTextLike || hasAttachment)) || (hasPaymentProofWords && hasAttachment)) {
    return "payment_proof";
  }
  if (isGreetingIntent(text) || isNewOrderRequestIntent(text)) return "greeting";
  if (buildFaqReply(text, state)) return "faq";

  return "unknown";
}

const customerIntentValues = new Set<CustomerIntent>([
  "web_order",
  "confirm",
  "cancel",
  "change",
  "fresh_order",
  "human",
  "half_payment",
  "full_payment",
  "payment_proof",
  "no_order_claim",
  "greeting",
  "faq",
  "unknown"
]);

function isCustomerIntentValue(value: unknown): value is CustomerIntent {
  return typeof value === "string" && customerIntentValues.has(value as CustomerIntent);
}

function parseAiIntent(payload: WaflowPayload): AiIntentPayload | null {
  const candidate = payload.aiIntent ?? payload.ai_intent ?? payload.ai?.intent;
  if (!candidate) return null;

  if (isCustomerIntentValue(candidate)) {
    return {
      intent: candidate,
      confidence: typeof payload.ai?.confidence === "number" ? payload.ai.confidence : undefined,
      reason: payload.ai?.reason,
      safeToUse: payload.ai?.safeToUse
    };
  }

  if (typeof candidate !== "object") return null;
  const intent = isCustomerIntentValue(candidate.intent) ? candidate.intent : undefined;
  if (!intent) return null;

  const confidence = Number(candidate.confidence);
  return {
    ...candidate,
    intent,
    confidence: Number.isFinite(confidence) ? confidence : undefined,
    suggestedReply: cleanText(candidate.suggestedReply, 900)
  };
}

function safeSuggestedReply(aiIntent: AiIntentPayload | null, fallback: string) {
  if (!fallback || !aiIntent?.suggestedReply || aiIntent.safeToUse === false) return fallback;

  const confidence = typeof aiIntent.confidence === "number" ? aiIntent.confidence : 0;
  if (confidence < 0.72) return fallback;

  const reply = cleanText(aiIntent.suggestedReply, 900);
  if (!reply) return fallback;

  const fallbackAmounts = fallback.match(/\b\d+(?:[.,]\d+)?\s*Bs\b/gi) ?? [];
  if (fallbackAmounts.length && !fallbackAmounts.every((amount) => reply.includes(amount))) {
    return fallback;
  }

  return reply;
}

function chooseEffectiveIntent(
  ruleIntent: CustomerIntent,
  aiIntent: AiIntentPayload | null,
  state: BotState,
  hasAttachment: boolean
): CustomerIntent {
  if (ruleIntent === "web_order" || ruleIntent === "payment_proof") return ruleIntent;
  if (!aiIntent?.intent || aiIntent.safeToUse === false) return ruleIntent;

  const confidence = typeof aiIntent.confidence === "number" ? aiIntent.confidence : 0;
  if (confidence < 0.78) return ruleIntent;

  if (aiIntent.intent === "payment_proof") {
    return hasAttachment ? "payment_proof" : ruleIntent;
  }

  if (["cancel", "change", "fresh_order", "human", "no_order_claim"].includes(aiIntent.intent)) {
    return aiIntent.intent;
  }

  if (state.stage === "esperando_tipo_pago" && ["half_payment", "full_payment"].includes(aiIntent.intent)) {
    return aiIntent.intent;
  }

  if (state.stage === "esperando_confirmacion" && aiIntent.intent === "confirm") {
    return "confirm";
  }

  if (["unknown", "greeting", "faq"].includes(ruleIntent) && aiIntent.intent !== "unknown") {
    return aiIntent.intent;
  }

  return ruleIntent;
}

function buildFaqReply(text: string, state: BotState) {
  const normalized = normalizeIntentText(text);
  if (!normalized) return "";

  if (isHalfPaymentIntent(text, state) || isFullPaymentIntent(text, state)) return "";

  const suffix = state.order
    ? " Si seguimos con tu pedido, responde SI. Si quieres cambiarlo, dime CAMBIAR."
    : ` Para pedir, entra a la web: ${nachitoStoreUrl}`;

  if (hasAnyPhrase(normalized, ["cuanto tarda", "cuando estaria", "cuando esta listo", "tiempo", "demora", "dias"])) {
    return `Normalmente demora 2 a 4 dias habiles desde que se confirma el pago.${suffix}`;
  }

  if (
    hasAnyPhrase(normalized, [
      "caracteristicas",
      "como son",
      "calidad",
      "material",
      "tela",
      "algodon",
      "cuello",
      "estampado",
      "dtf",
      "oversize"
    ])
  ) {
    return `Son poleras oversize de 200 g en algodon premium, con cuello reforzado de 3 cm y estampado DTF de buena duracion. Trabajamos tallas M, L y XL en blanco arena y negro.${suffix}`;
  }

  if (hasAnyPhrase(normalized, ["envio", "entrega", "yango", "delivery", "recoger", "retiro"])) {
    return `En Santa Cruz puedes recoger o pedir envio por Yango. Para otros departamentos enviamos por flota jueves y viernes. El envio es adicional.${suffix}`;
  }

  if (hasAnyPhrase(normalized, ["pago", "pagar", "qr", "transferencia", "comprobante", "adelanto"])) {
    if (state.stage === "esperando_comprobante") {
      return "Cuando pagues, manda la foto del comprobante por aqui.";
    }

    return state.order
      ? "Puedes pagar 50% de adelanto o completo. Responde 1 para 50% o 2 para completo."
      : `Primero arma tu pedido desde la web y despues te paso las opciones de pago: ${nachitoStoreUrl}`;
  }

  if (hasAnyPhrase(normalized, ["precio", "cuesta", "vale", "costo", "cotizar"])) {
    return state.order
      ? `Tu pedido esta en ${state.order.total || "precio por confirmar"} Bs.${suffix}`
      : `Los precios del catalogo van desde Bs 125 a Bs 180 y las personalizadas desde Bs 155. Puedes cotizar desde la web: ${nachitoStoreUrl}`;
  }

  if (hasAnyPhrase(normalized, ["stock", "disponible", "hay talla", "talla disponible", "colores"])) {
    return `El stock se valida desde la web al armar tu pedido.${suffix}`;
  }

  if (hasAnyPhrase(normalized, ["personalizada", "personalizar", "diseno", "logo", "imagen", "referencia"])) {
    return `Para personalizada, sube tus referencias en la web y deja los detalles del diseno.${suffix}`;
  }

  return "";
}

function buildRecoveryReply(state: BotState, customerName: string) {
  if (!state.order) {
    return buildStartOnWebsiteReply(customerName);
  }

  if (state.stage === "esperando_confirmacion") {
    return `Tienes un pedido pendiente.\n\n${buildSummary(state.order)}\n\nResponde SI para confirmar o NO para cancelar.`;
  }

  if (state.stage === "esperando_tipo_pago") {
    return buildPendingOrderReply(state.stage);
  }

  if (state.stage === "esperando_comprobante") {
    return buildPendingOrderReply(state.stage);
  }

  return `Te sigo ayudando con tu pedido.\n\n${buildSummary(state.order)}\n\nResponde SI, NO o CAMBIAR.`;
}

function buildHumanHandoffReply(customerName: string) {
  return `Listo ${customerName}, te paso con una persona de Nachito Store.`;
}

function buildPendingOrderReply(stage: BotStage) {
  if (stage === "esperando_ubicacion") {
    return buildLocationQuestionReply();
  }

  if (stage === "esperando_departamento") {
    return buildDepartmentQuestionReply();
  }

  if (stage === "esperando_tipo_pago") {
    return `Tu pedido ya esta confirmado.\n\nResponde 1 para 50% o 2 para completo.`;
  }

  if (stage === "esperando_comprobante") {
    return "Tu pedido esta esperando comprobante.\n\nCuando pagues, manda la foto o PDF por aqui.";
  }

  return "Tienes un pedido pendiente.\n\nResponde SI para confirmar o NO para cancelar.";
}

function wasPromptRecentlySent(state: BotState, prompt: string, windowMs = 4 * 60 * 1000) {
  if (state.lastPrompt !== prompt || !state.lastPromptAt) return false;
  return Date.now() - new Date(state.lastPromptAt).getTime() < windowMs;
}

function markPromptSent(state: BotState, prompt: string): BotState {
  return {
    ...state,
    lastPrompt: prompt,
    lastPromptAt: new Date().toISOString()
  };
}

function humanHelpHint() {
  return "";
}

function splitReplyMessages(replyText: string) {
  if (/^(\u00A1Hola!|\uD83D\uDCCB \*Pedido nuevo:\*|\u2705 Pedido confirmado|\uD83D\uDCCE Comprobante recibido|Pedido nuevo:|\u23F3 En revisi\u00F3n|Perfecto\.)/.test(replyText.trim())) {
    return [replyText.trim()];
  }

  return replyText
    .split(/\n{2,}/)
    .map((message) => message.trim())
    .filter(Boolean)
    .slice(0, 8);
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
  const phoneVariants = phoneLookupVariants(phone);
  if (!phoneVariants.length) return null;

  const { data, error } = await supabase
    .from("orders")
    .select("id, order_number, order_status, payment_status, total, payment_proof_urls")
    .in("customer_phone", phoneVariants)
    .order("created_at", { ascending: false })
    .limit(8);

  if (error || !data) return null;

  return data.find((order: { order_status?: string }) => !["Cancelado", "Entregado"].includes(order.order_status ?? "")) ?? null;
}

async function cancelLatestOpenOrder(
  supabase: SupabaseClient,
  payload: { phone: string; conversationId: string; reason: string }
) {
  const latestOrder = await findLatestOpenOrder(supabase, payload.phone);
  if (!latestOrder?.id || ["Cancelado", "Entregado"].includes(latestOrder.order_status ?? "")) return null;

  await updateOrder(String(latestOrder.order_number), { status: "Cancelado" });

  const { data, error } = await supabase
    .from("orders")
    .update({
      bot_conversation_id: payload.conversationId,
      bot_stage: "cancelado",
      requires_manual_review: false
    })
    .eq("id", latestOrder.id)
    .select("id, order_number, order_status")
    .single();

  if (error) throw error;

  await supabase
    .from("payment_requests")
    .update({
      status: "canceled",
      verification_payload: {
        source: "waflow-bot",
        reason: payload.reason,
        canceledAt: new Date().toISOString()
      }
    })
    .eq("order_id", latestOrder.id)
    .in("status", ["pending", "proof_received"]);

  return data;
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
    attachmentDetails?: ReturnType<typeof parseAttachmentDetails>;
    proofText?: string;
    proofEvidence?: ReturnType<typeof parseIncomingProofEvidence>;
    messageType?: string;
    settings: Map<string, string>;
  }
) {
  if (!payload.state.paymentChoice || !payload.state.paymentAmount) return null;

  const latestOrder = await findLatestOpenOrder(supabase, payload.phone);
  const provider = payload.settings.get("payment_provider") || process.env.PAYMENT_PROVIDER || "manual_qr_mercantil";
  const gatewayEnabled = boolSetting(payload.settings, "payment_gateway_enabled", false);
  const qrUrl = payload.settings.get("payment_qr_placeholder_url") || manualPaymentQrUrl;
  const externalReference = `${latestOrder?.order_number ?? payload.conversationId}-${payload.state.paymentChoice}`;
  const proofEvidence = payload.proofEvidence ?? parseProofEvidence(payload.proofText);

  const query = latestOrder?.id
    ? supabase
        .from("payment_requests")
        .select("id, proof_url, verification_payload")
        .eq("order_id", latestOrder.id)
        .in("status", ["pending", "proof_received"])
        .limit(1)
        .maybeSingle()
    : supabase
        .from("payment_requests")
        .select("id, proof_url, verification_payload")
        .eq("conversation_id", payload.conversationId)
        .in("status", ["pending", "proof_received"])
        .limit(1)
        .maybeSingle();

  const { data: existing } = await query;
  const previousPayload = ((existing?.verification_payload as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
  const previousProof = ((previousPayload.proof as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
  const proofUrl = payload.attachmentUrl ?? (cleanText(existing?.proof_url, 500) || null);
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
    proof_url: proofUrl,
    verification_payload: {
      ...previousPayload,
      gatewayReady: gatewayEnabled,
      manualQrReady: Boolean(qrUrl),
      source: "waflow-bot",
      order: payload.state.order ?? null,
      proof: {
        ...previousProof,
        ...proofEvidence,
        url: proofUrl,
        mediaId: payload.attachmentDetails?.mediaId ?? previousProof.mediaId,
        type: payload.attachmentDetails?.type ?? payload.messageType ?? previousProof.type,
        mimeType: payload.attachmentDetails?.mimeType ?? previousProof.mimeType,
        fileName: payload.attachmentDetails?.fileName ?? previousProof.fileName,
        receivedAt: payload.attachmentUrl ? new Date().toISOString() : previousProof.receivedAt,
        amountMatchesRequest:
          proofEvidence.amount !== undefined ? sameMoney(proofEvidence.amount, payload.state.paymentAmount) : previousProof.amountMatchesRequest
      }
    }
  };

  const result = existing?.id
    ? await supabase.from("payment_requests").update(paymentPayload).eq("id", existing.id).select("id, status, provider, amount, qr_url").single()
    : await supabase.from("payment_requests").insert(paymentPayload).select("id, status, provider, amount, qr_url").single();

  if (latestOrder?.id) {
    const deliveryNotes =
      payload.state.deliveryArea === "otro_departamento"
        ? {
            deliveryArea: "Otro departamento" as const,
            deliveryDepartment: payload.state.deliveryDepartment,
            delivery: "Flota" as const
          }
        : payload.state.deliveryArea === "santa_cruz"
          ? {
              deliveryArea: "Santa Cruz" as const,
              delivery: "Yango" as const
            }
          : {};

    if (Object.keys(deliveryNotes).length) {
      await updateOrder(String(latestOrder.order_number), deliveryNotes);
    }

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

    if (proofUrl) {
      const existingProofs = Array.isArray(latestOrder.payment_proof_urls) ? latestOrder.payment_proof_urls : [];
      const nextProofs = [...new Set([...existingProofs, proofUrl])];
      await supabase.from("orders").update({ payment_proof_urls: nextProofs }).eq("id", latestOrder.id);
    }
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
  const stableMessageId = cleanText(message.id, 80);
  const webhookTimestamp = cleanText(payload.timestamp, 80);
  const messageTimestamp = cleanText(message.timestamp, 60);
  const timestamp = stableMessageId || webhookTimestamp || messageTimestamp;
  const direction = cleanText(message.direction, 40).toLowerCase() || "inbound";
  const slotId = cleanText(payload.slot?.id ?? payload.data?.slot?.id ?? payload.payload?.slot?.id, 60);
  const event = cleanText(payload.event, 120).toLowerCase() || "waflow";
  const body = `${event}|${slotId}|${phone}|${direction}|${timestamp}|${messageType}|${text.toLowerCase()}`;

  return `waflow:${stableHash(body)}`;
}

function nextBotState(state: BotState, text: string, customerName: string, messageType: string) {
  const lower = text.toLowerCase();
  const isTextLike = isTextLikeMessage(messageType, text);
  const hasPaymentProofWords = /comprobante|pagad|pagu[eé]|transfer|deposit/i.test(lower);
  const confirmsOrder = /^(si|s[ií]|confirmo|confirmar|ok|dale|listo|perfecto|de acuerdo|adelante)$/i.test(lower.trim());
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
    replyText = buildProofReviewReply();
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (/(^|\s)(50%?|mitad|adelanto)(\s|$)/i.test(lower) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total * 0.5) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "50%", paymentAmount };
    replyText = paymentAmount ? `Perfecto. Adelanto: ${paymentAmount} Bs.\n\nTe mando el QR de pago. Cuando pagues, manda el comprobante.` : "Perfecto. Revisamos el monto y te pasamos el QR.";
    return { state: nextState, replyText, needsHuman, sendPaymentQr: Boolean(paymentAmount) };
  }

  if (/(completo|todo|100%?|total)/i.test(lower) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "completo", paymentAmount };
    replyText = paymentAmount ? `Perfecto. Total: ${paymentAmount} Bs.\n\nTe mando el QR de pago. Cuando pagues, manda el comprobante.` : "Perfecto. Revisamos el monto y te pasamos el QR.";
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

function nextBotStateV2(
  state: BotState,
  text: string,
  customerName: string,
  messageType: string,
  hasAttachment = false,
  aiIntent: AiIntentPayload | null = null
): BotDecision {
  const lower = text.toLowerCase();
  const isTextLike = isTextLikeMessage(messageType, text);
  const hasPaymentProofWords = /comprobante|pagad|pagu|transfer|deposit/i.test(lower);
  const ruleIntent = detectCustomerIntent(text, state, messageType, hasAttachment);
  const intent = chooseEffectiveIntent(ruleIntent, aiIntent, state, hasAttachment);
  const confirmsOrder = intent === "confirm";
  const cancelsOrder = intent === "cancel";
  const wantsOrderChange = intent === "change";
  const wantsFreshOrder = intent === "fresh_order";
  const claimsNoOrder = intent === "no_order_claim";
  let nextState: BotState = { ...state, updatedAt: new Date().toISOString() };
  let replyText = "";
  let needsHuman = false;

  if (state.order && claimsNoOrder) {
    return {
      state: initialState(),
      replyText: `Listo ${customerName}, cancelé el pedido abierto en este chat.\n\nSi quieres hacer uno nuevo, entra a la web:\n👉 ${nachitoStoreUrl}`,
      needsHuman: false,
      cancelOpenOrder: true,
      cancelReason: "cliente indica que no tiene pedido"
    };
  }

  if (state.order && wantsFreshOrder && !looksLikeWebOrderMessage(text)) {
    return {
      state: initialState(),
      replyText: `Entendido, pedido cancelado.\nSi quieres empezar de nuevo, entra a la web:\n👉 ${nachitoStoreUrl}`,
      needsHuman: false,
      cancelOpenOrder: true,
      cancelReason: "cliente quiere pedido nuevo"
    };
  }

  if (wantsOrderChange && state.order) {
    nextState = initialState();
    return {
      state: nextState,
      replyText: `Entendido, pedido cancelado.\nSi quieres empezar de nuevo, entra a la web:\n👉 ${nachitoStoreUrl}`,
      needsHuman: false,
      cancelOpenOrder: true,
      cancelReason: "cliente se equivoco en el pedido"
    };
  }

  if (cancelsOrder) {
    return {
      state: initialState(),
      replyText: `Entendido, pedido cancelado.\nSi quieres empezar de nuevo, entra a la web:\n👉 ${nachitoStoreUrl}`,
      needsHuman: false,
      cancelOpenOrder: true,
      cancelReason: "cliente cancelo por whatsapp"
    };
  }

  if (intent === "human") {
    nextState = { ...nextState, stage: "atencion_manual" };
    return {
      state: nextState,
      replyText: buildHumanHandoffReply(customerName),
      needsHuman: true,
      botActive: false
    };
  }

  if (state.stage === "esperando_comprobante" && hasPaymentProofWords && !hasAttachment && isTextLike) {
    nextState = { ...nextState, stage: "esperando_comprobante" };
    replyText = `Perfecto ${customerName}.\n\nMandame la foto del comprobante para revisarlo.`;
    return { state: nextState, replyText, needsHuman };
  }

  if (intent === "payment_proof") {
    nextState = { ...nextState, stage: "comprobante_recibido" };
    replyText = buildProofReviewReply();
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (!isTextLike) {
    nextState = { ...nextState, stage: "atencion_manual" };
    replyText = buildProofReviewReply();
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (state.stage === "esperando_comprobante" && intent === "greeting") {
    replyText =
      "Sí, estamos atendiendo.\n\nTengo tu pedido esperando comprobante. Si ya pagaste, manda la foto o PDF por aquí. Si fue error, responde CANCELAR.";
    return { state: nextState, replyText: safeSuggestedReply(aiIntent, replyText), needsHuman };
  }

  if (isFreshWebOrderMessage(text, state)) {
    const order = parseOrder(text);
    const missing = missingFields(order);

    if (missing.length) {
      nextState = { stage: "faltan_datos", order, updatedAt: new Date().toISOString() };
      replyText = `Recibi tu pedido nuevo.\n\nMe falta: ${missing.join(", ")}.`;
      return { state: nextState, replyText, needsHuman };
    }

    nextState = { stage: "esperando_confirmacion", order, updatedAt: new Date().toISOString() };
    replyText = buildOrderConfirmationMessage(order);
    return { state: nextState, replyText, needsHuman };
  }

  if (state.stage === "esperando_ubicacion" && state.order) {
    if (isSantaCruzIntent(text)) {
      nextState = { ...nextState, stage: "esperando_tipo_pago", deliveryArea: "santa_cruz" };
      replyText = buildPaymentChoiceReply(state.order, nextState);
      return { state: nextState, replyText, needsHuman };
    }

    if (isOtherDepartmentIntent(text)) {
      nextState = { ...nextState, stage: "esperando_departamento", deliveryArea: "otro_departamento" };
      replyText = buildDepartmentQuestionReply();
      return { state: nextState, replyText, needsHuman };
    }

    replyText = buildLocationQuestionReply();
    return { state: nextState, replyText, needsHuman };
  }

  if (state.stage === "esperando_departamento" && state.order) {
    const department = parseDepartmentName(text);
    if (!department) {
      replyText = buildDepartmentQuestionReply();
      return { state: nextState, replyText, needsHuman };
    }

    nextState = {
      ...nextState,
      stage: "esperando_tipo_pago",
      deliveryArea: "otro_departamento",
      deliveryDepartment: department
    };
    replyText = buildPaymentChoiceReply(state.order, nextState);
    return { state: nextState, replyText, needsHuman };
  }

  const faqReply = buildFaqReply(text, state);
  if (faqReply) {
    return { state: nextState, replyText: safeSuggestedReply(aiIntent, faqReply), needsHuman };
  }

  const stateStartedFromWeb = Boolean(state.order?.details && looksLikeWebOrderMessage(state.order.details));
  const asksForNewOrder = intent === "greeting" || isNewOrderRequestIntent(text);

  if (!looksLikeWebOrderMessage(text) && (!state.order || !stateStartedFromWeb)) {
    nextState = { stage: "nuevo", updatedAt: new Date().toISOString() };
    nextState = markPromptSent(nextState, "start_on_website");
    replyText = safeSuggestedReply(aiIntent, buildStartOnWebsiteReply(customerName));
    return { state: nextState, replyText, needsHuman };
  }

  if (state.stage === "esperando_confirmacion" && state.order) {
    if (looksLikeWebOrderMessage(text)) {
      return { state: nextState, replyText: "", needsHuman };
    }

    if (!confirmsOrder) {
      if (asksForNewOrder) {
        replyText = `Hola ${customerName}, tienes un pedido pendiente.\n\nResponde SI para confirmarlo o NO para cancelarlo.`;
      } else {
        replyText = `Antes de avanzar, confirma este pedido:\n\n${buildSummary(state.order)}\n\nResponde SI o NO.`;
      }
      return { state: nextState, replyText, needsHuman };
    }

    nextState = { ...nextState, stage: "esperando_ubicacion" };
    replyText = buildLocationQuestionReply();
    return { state: nextState, replyText, needsHuman };
  }

  if (intent === "half_payment" && state.order && state.stage === "esperando_tipo_pago") {
    const paymentAmount = state.order.total ? safeMoney(state.order.total * 0.5) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "50%", paymentAmount };
    replyText = paymentAmount
      ? buildPaymentInstructionReply("50%", paymentAmount)
      : `Perfecto. Revisamos el monto y te pasamos el QR.${humanHelpHint()}`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman, sendPaymentQr: Boolean(paymentAmount) };
  }

  if (intent === "full_payment" && state.order && state.stage === "esperando_tipo_pago") {
    const paymentAmount = state.order.total ? safeMoney(state.order.total) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "completo", paymentAmount };
    replyText = paymentAmount
      ? buildPaymentInstructionReply("completo", paymentAmount)
      : `Perfecto. Revisamos el monto y te pasamos el QR.${humanHelpHint()}`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman, sendPaymentQr: Boolean(paymentAmount) };
  }

  if (state.stage === "esperando_tipo_pago" && state.order) {
    nextState = markPromptSent(nextState, "payment_choice");
    replyText = safeSuggestedReply(aiIntent, buildPendingOrderReply(state.stage));
    return { state: nextState, replyText, needsHuman };
  }

  const looksUsefulForOrder =
    looksLikeWebOrderMessage(text) || /\b(color|talla|precio|total|bs|frente|espalda|negro|blanco arena|personaliz|catalogo)\b/i.test(text);

  if (!looksUsefulForOrder && state.order) {
    replyText = safeSuggestedReply(aiIntent, buildRecoveryReply(state, customerName));
    return { state: nextState, replyText, needsHuman };
  }

  const order = parseOrder(text, state.order);
  const missing = missingFields(order);

  if (missing.length) {
    nextState = { ...nextState, stage: "faltan_datos", order };
    replyText = `Ya recibi tu mensaje, ${customerName}.\n\nMe falta: ${missing.join(", ")}.`;
    return { state: nextState, replyText, needsHuman };
  }

  nextState = { ...nextState, stage: "esperando_confirmacion", order };
  replyText = buildOrderConfirmationMessage(order);

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
    const attachmentDetails = parseAttachmentDetails(payload);
    const attachmentUrl = attachmentDetails.url;
    const proofText = parseProofText(payload, text);
    const proofEvidence = parseIncomingProofEvidence(payload, proofText);
    const aiIntent = parseAiIntent(payload);
    const incomingOrderPreview = looksLikeWebOrderMessage(text) ? parseOrder(text) : undefined;

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
    const creationCustomerName = resolveCustomerName(existingConversation?.customer_name, name, { order: incomingOrderPreview });
    if (!conversation) {
      const { data: createdConversation, error: createConversationError } = await supabase
        .from("conversations")
        .insert({
          customer_name: creationCustomerName,
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

    await supabase.from("messages").insert({
      conversation_id: conversation.id,
      direction: fromMe ? "outbound" : "inbound",
      body: inboundBody,
      source: "waflow",
      metadata: { raw: payload, attachmentUrl, attachmentDetails }
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
    const botCustomerName = resolveCustomerName(conversation.customer_name, name, {
      order: currentState.order ?? incomingOrderPreview
    });
    const { state, replyText, needsHuman, botActive, cancelOpenOrder, cancelReason, sendPaymentQr } = nextBotStateV2(
      currentState,
      text,
      botCustomerName,
      messageType,
      Boolean(attachmentUrl),
      aiIntent
    );
    const replyMessages = splitReplyMessages(replyText);
    const canceledOrder = cancelOpenOrder
      ? await cancelLatestOpenOrder(supabase, {
          conversationId: conversation.id,
          phone,
          reason: cancelReason ?? "cliente cancelo por whatsapp"
        })
      : null;
    const paymentRequest = await upsertPaymentRequest(supabase, {
      conversationId: conversation.id,
      phone,
      state,
      attachmentUrl,
      attachmentDetails,
      proofText,
      proofEvidence,
      messageType,
      settings
    });

    await logBotEvent(supabase, {
      conversationId: conversation.id,
      orderId: canceledOrder?.id,
      eventType: canceledOrder ? "order_canceled_by_bot" : paymentRequest ? "payment_request_updated" : "bot_stage_changed",
      previousStage,
      nextStage: state.stage,
      data: {
        canceledOrder,
        cancelReason,
        paymentRequest,
        paymentChoice: state.paymentChoice,
        paymentAmount: state.paymentAmount,
        needsHuman,
        messageType,
        hasAttachment: Boolean(attachmentUrl),
        aiIntent
      }
    });

    if (replyText) {
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
    } else {
      await supabase.from("messages").insert({
        conversation_id: conversation.id,
        direction: "outbound",
        body: "[sin respuesta enviada]",
        source: "bot",
        metadata: {
          botState: state,
          needsHuman,
          suppressed: true
        }
      });
    }

    const paymentFlow = {
      paymentChoice: state.paymentChoice,
      paymentAmount: state.paymentAmount,
      paymentRequestId: paymentRequest?.id,
      provider: paymentRequest?.provider,
      qrUrl: sendPaymentQr ? (paymentRequest?.qr_url ?? manualPaymentQrUrl) : null
    };

    const conversationUpdate: Record<string, unknown> = {
      customer_name: resolveCustomerName(conversation.customer_name, name, state),
      status: state.stage,
      bot_stage: state.stage,
      waflow_contact_id: waflowContext.waflowContactId,
      waflow_location_id: waflowContext.waflowLocationId,
      chatwoot_conversation_id: waflowContext.chatwootConversationId,
      last_inbound_message_id: cleanText(payloadMessage.id, 120) || eventKey,
      payment_flow: paymentFlow,
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
        payment_flow: paymentFlow,
        paymentRequest,
        canceledOrder,
        sendPaymentQr,
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
