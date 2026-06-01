import { NextResponse } from "next/server";
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
  text?: string;
  content?: string;
  messageText?: string;
  phone?: string;
  from?: string;
  customerPhone?: string;
  customerName?: string;
  name?: string;
  fromMe?: boolean;
  messageType?: string;
  type?: string;
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
    whatsapp?: string;
    wa_id?: string;
    profile?: {
      name?: string;
    };
  };
  message?: {
    text?: string;
    body?: string;
    content?: string;
    type?: string;
    from?: string;
    fromMe?: boolean;
  };
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

function parseContact(payload: WaflowPayload) {
  const message = payload.message ?? payload.data?.message ?? payload.payload?.message ?? {};
  const contact = payload.contact ?? payload.data?.contact ?? payload.payload?.contact ?? {};
  const phone = normalizePhone(
    payload.phone ??
      payload.from ??
      payload.customerPhone ??
      contact.phone ??
      contact.whatsapp ??
      contact.wa_id ??
      message.from
  );

  const name =
    cleanText(payload.customerName ?? payload.name ?? contact.name ?? contact.fullName ?? contact.profile?.name, 80) ||
    "Cliente WhatsApp";

  return { name, phone };
}

function parseWaflowContext(payload: WaflowPayload) {
  const contact = payload.contact ?? payload.data?.contact ?? payload.payload?.contact ?? {};
  const slot = payload.slot ?? payload.data?.slot ?? payload.payload?.slot ?? {};

  return {
    waflowContactId: cleanText(contact.id, 80) || undefined,
    waflowLocationId: cleanText(payload.locationId ?? payload.data?.locationId ?? payload.payload?.locationId, 120) || undefined,
    waflowSlotId: cleanText(slot.id ?? slot.slotId, 40) || undefined
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
  return `Hola ${customerName}, soy el asistente de Nachito Store.\n\nPara atenderte bien y no perder datos, primero haz tu pedido desde la pagina web:\n${nachitoStoreUrl}\n\nAhi puedes escoger una polera del catalogo o cotizar una personalizada. Cuando envies el pedido desde la web, seguimos por este WhatsApp.\n\nSi prefieres que te atienda una persona, responde HUMANO.`;
}

function wantsHumanHelp(text: string) {
  return /\b(humano|persona|asesor|vendedor|atencion|atencion manual|hablar con alguien|quiero hablar|ayuda humana|soporte)\b/i.test(text);
}

function buildHumanHandoffReply(customerName: string) {
  return `Listo ${customerName}, te paso con una persona de Nachito Store.\n\nDejo este chat marcado para atencion manual. Si ya tienes un pedido, no te preocupes: queda registrado para revisarlo y responderte desde aqui.`;
}

function humanHelpHint() {
  return "\n\nSi en cualquier momento prefieres que te atienda una persona, responde HUMANO.";
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
  const confirmsOrder = /^(si|confirmo|confirmar|ok|dale|listo|perfecto|de acuerdo|adelante)$/i.test(lower.trim());
  const cancelsOrder = /^(no|cancelar|salir|reiniciar|empezar de nuevo|mejor no)$/i.test(lower.trim());
  let nextState: BotState = { ...state, updatedAt: new Date().toISOString() };
  let replyText = "";
  let needsHuman = false;

  if (cancelsOrder) {
    return {
      state: initialState(),
      replyText: `Entendido ${customerName}, cancelamos este flujo.\n\nSi quieres empezar de nuevo, vuelve a enviar tu pedido desde la web de Nachito Store o responde HUMANO para que una persona te ayude.`,
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
    replyText = `Recibi tu comprobante, ${customerName}.\n\nLo dejo en revision para confirmar el pago. Apenas se valide, tu pedido pasa a preparacion.`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (!isTextLike) {
    nextState = { ...nextState, stage: "atencion_manual" };
    replyText = `Recibi tu archivo, ${customerName}.\n\nLo dejo para revision manual, asi podemos verlo bien y ayudarte con tu pedido.`;
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
      replyText = `Antes de avanzar quiero confirmar que todo este bien:\n\n${buildSummary(state.order)}\n\nResponde SI para confirmar o NO para cancelar.${humanHelpHint()}`;
      return { state: nextState, replyText, needsHuman };
    }

    nextState = { ...nextState, stage: "esperando_tipo_pago" };
    const half = state.order.total ? safeMoney(state.order.total * 0.5) : 0;
    replyText = `Genial, pedido confirmado.\n\nComo prefieres pagar?\n\n- Responde 50% para adelantar ${half} Bs\n- Responde COMPLETO para pagar ${state.order.total} Bs${humanHelpHint()}`;
    return { state: nextState, replyText, needsHuman };
  }

  if (/(^|\s)(50%?|mitad|adelanto)(\s|$)/i.test(lower) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total * 0.5) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "50%", paymentAmount };
    replyText = paymentAmount
      ? `Perfecto. Para reservar tu pedido seria el 50%: ${paymentAmount} Bs.\n\nPor ahora el QR se confirma manualmente. Te dejare el pedido marcado para que una persona revise el cobro y te pase el QR si hace falta.\n\nCuando pagues, envia aqui la foto del comprobante.`
      : `Perfecto, registramos que quieres pagar el 50%. Primero revisamos el monto exacto y luego te pasamos el QR.${humanHelpHint()}`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (/(completo|todo|100%?|total)/i.test(lower) && state.order) {
    const paymentAmount = state.order.total ? safeMoney(state.order.total) : 0;
    nextState = { ...nextState, stage: "esperando_comprobante", paymentChoice: "completo", paymentAmount };
    replyText = paymentAmount
      ? `Perfecto. El pago completo es ${paymentAmount} Bs.\n\nPor ahora el QR se confirma manualmente. Te dejare el pedido marcado para que una persona revise el cobro y te pase el QR si hace falta.\n\nCuando pagues, envia aqui la foto del comprobante.`
      : `Perfecto, registramos que quieres pagar completo. Primero revisamos el monto exacto y luego te pasamos el QR.${humanHelpHint()}`;
    needsHuman = true;
    return { state: nextState, replyText, needsHuman };
  }

  if (state.stage === "esperando_tipo_pago" && state.order) {
    replyText = `Para avanzar responde 50% si quieres adelantar la mitad, o COMPLETO si quieres pagar todo el pedido.${humanHelpHint()}`;
    return { state: nextState, replyText, needsHuman };
  }

  const order = parseOrder(text, state.order);
  const missing = missingFields(order);

  if (missing.length) {
    nextState = { ...nextState, stage: "faltan_datos", order };
    replyText = `Hola ${customerName}, ya recibi tu mensaje.\n\nPara dejar bien armado el pedido me falta: ${missing.join(", ")}.\n\nResponde esos datos por aqui y te confirmo el resumen.${humanHelpHint()}`;
    return { state: nextState, replyText, needsHuman };
  }

  nextState = { ...nextState, stage: "esperando_confirmacion", order };
  replyText = `Hola ${customerName}, ya tengo tu pedido:\n\n${buildSummary(order)}\n\nConfirmamos el pedido? Responde SI para confirmar o NO para cancelar.${humanHelpHint()}`;

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
    const messageType = cleanText(payload.message?.type ?? payload.data?.message?.type ?? payload.messageType ?? payload.type, 40) || "text";
    const fromMe = Boolean(payload.message?.fromMe ?? payload.data?.message?.fromMe ?? payload.fromMe);
    const { name, phone } = parseContact(payload);
    const waflowContext = parseWaflowContext(payload);

    if (!phone) {
      throw new RequestSecurityError("Falta telefono del cliente.", 400);
    }

    const supabase = requireSupabaseAdminClient();
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
      body: text || `[${messageType}]`,
      source: "waflow",
      metadata: { raw: payload }
    });

    if (!conversation.bot_active || fromMe) {
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
    const { state, replyText, needsHuman, botActive } = nextBotStateV2(currentState, text, name, messageType);

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

    const conversationUpdate: Record<string, string | boolean> = {
      customer_name: name,
      status: state.stage,
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
        replyTargetPhone: phone,
        ...waflowContext,
        paymentChoice: state.paymentChoice,
        paymentAmount: state.paymentAmount,
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
