import { createSupabaseAdminClient } from "@/lib/supabase";
import type { Conversation, ConversationMessage } from "@/types";

interface ConversationRow {
  id: string;
  customer_name: string | null;
  phone: string;
  bot_active: boolean | null;
  status: string | null;
  bot_stage: string | null;
  last_message_at: string | null;
  payment_flow: Record<string, unknown> | null;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  direction: "inbound" | "outbound";
  body: string | null;
  source: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
  provider_message_id?: string | null;
  delivery_status?: string | null;
  delivery_error?: string | null;
  sent_at?: string | null;
  delivered_at?: string | null;
  read_at?: string | null;
}

interface ManualMessageInput {
  id?: string;
  phone?: string;
  body: string;
  providerMessageId?: string;
  deliveryStatus?: string;
  deliveryPayload?: Record<string, unknown>;
}

interface SyncedProviderMessageInput {
  phone: string;
  customerName?: string;
  direction: "inbound" | "outbound";
  body: string;
  source: string;
  providerMessageId?: string;
  deliveryStatus?: string;
  metadata?: Record<string, unknown>;
  attachmentUrl?: string;
  attachmentType?: string;
  createdAt?: string;
}

interface DeliveryStatusInput {
  providerMessageId: string;
  status: string;
  error?: string;
  payload?: Record<string, unknown>;
  occurredAt?: string;
}

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 24) : "";
}

function messageAttachment(message: MessageRow) {
  const metadata = message.metadata ?? {};
  const raw = typeof metadata.raw === "object" && metadata.raw !== null ? metadata.raw as Record<string, unknown> : {};
  const details =
    typeof metadata.attachmentDetails === "object" && metadata.attachmentDetails !== null
      ? metadata.attachmentDetails as Record<string, unknown>
      : {};
  const attachmentUrl = typeof metadata.attachmentUrl === "string" ? metadata.attachmentUrl : "";
  const detailsUrl = typeof details.url === "string" ? details.url : "";
  const attachmentType = typeof metadata.attachmentType === "string" ? metadata.attachmentType : "";
  const detailsType = typeof details.type === "string" ? details.type : "";
  const detailsMimeType = typeof details.mimeType === "string" ? details.mimeType : "";
  const rawType = typeof raw.type === "string" ? raw.type : "";

  return {
    attachmentUrl: attachmentUrl || detailsUrl || undefined,
    attachmentType: attachmentType || detailsMimeType || detailsType || rawType || undefined
  };
}

function mapMessage(message: MessageRow): ConversationMessage {
  const attachment = messageAttachment(message);

  return {
    id: message.id,
    direction: message.direction,
    body: message.body ?? "",
    createdAt: message.created_at ?? undefined,
    source: message.source ?? undefined,
    attachmentUrl: attachment.attachmentUrl,
    attachmentType: attachment.attachmentType,
    providerMessageId: message.provider_message_id ?? undefined,
    deliveryStatus: message.delivery_status as ConversationMessage["deliveryStatus"] | undefined,
    deliveryError: message.delivery_error ?? undefined,
    sentAt: message.sent_at ?? undefined,
    deliveredAt: message.delivered_at ?? undefined,
    readAt: message.read_at ?? undefined
  };
}

function isMissingDeliveryColumn(error?: { message?: string } | null) {
  return /provider_message_id|delivery_status|delivery_error|sent_at|delivered_at|read_at|schema cache|column .* does not exist/i.test(
    error?.message ?? ""
  );
}

function humanStage(stage?: string | null) {
  const normalized = (stage ?? "").trim().toLowerCase();

  const labels: Record<string, string> = {
    nuevo: "Nuevo",
    esperando_confirmacion: "Esperando confirmacion",
    esperando_ubicacion: "Esperando ubicacion",
    esperando_departamento: "Esperando departamento",
    esperando_tipo_pago: "Eligiendo pago",
    esperando_comprobante: "Falta comprobante",
    comprobante_recibido: "Comprobante recibido",
    pago_confirmado: "Pago confirmado",
    preparando: "En preparacion",
    cancelado: "Cancelado",
    manual: "Atencion manual"
  };

  return labels[normalized] ?? (stage ? stage.replace(/_/g, " ") : "Sin estado");
}

function requiresAttention(row: ConversationRow) {
  const stage = (row.bot_stage ?? row.status ?? "").toLowerCase();
  return !row.bot_active || [
    "esperando_comprobante",
    "comprobante_recibido",
    "pago_rechazado",
    "manual",
    "atencion_manual"
  ].some((flag) => stage.includes(flag));
}

function rowToConversation(row: ConversationRow, latestMessage?: MessageRow, messages: ConversationMessage[] = []): Conversation {
  const paymentFlow = row.payment_flow ?? {};

  return {
    id: row.id,
    name: row.customer_name?.trim() || "Cliente WhatsApp",
    phone: row.phone,
    bot: row.bot_active !== false,
    alert: requiresAttention(row),
    status: humanStage(row.bot_stage ?? row.status),
    stage: row.bot_stage ?? row.status ?? undefined,
    lastMessage: latestMessage?.body ?? undefined,
    lastMessageAt: row.last_message_at ?? latestMessage?.created_at ?? undefined,
    paymentAmount: typeof paymentFlow.paymentAmount === "number" ? paymentFlow.paymentAmount : undefined,
    paymentChoice: typeof paymentFlow.paymentChoice === "string" ? paymentFlow.paymentChoice : undefined,
    messages
  };
}

export async function readConversations(): Promise<Conversation[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("conversations")
    .select("id, customer_name, phone, bot_active, status, bot_stage, last_message_at, payment_flow")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(80);

  if (error) {
    console.warn("Supabase conversations read failed.", error.message);
    return [];
  }

  const rows = (data ?? []) as ConversationRow[];
  const ids = rows.map((row) => row.id);
  const latestByConversation = new Map<string, MessageRow>();
  const messagesByConversation = new Map<string, ConversationMessage[]>();

  if (ids.length) {
    const messageColumns =
      "id, conversation_id, direction, body, source, created_at, metadata, provider_message_id, delivery_status, delivery_error, sent_at, delivered_at, read_at";
    const legacyMessageColumns = "id, conversation_id, direction, body, source, created_at, metadata";

    const messageQuery = await supabase
      .from("messages")
      .select(messageColumns)
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(600);
    let messages = messageQuery.data as MessageRow[] | null;
    let messagesError = messageQuery.error;

    if (messagesError && isMissingDeliveryColumn(messagesError)) {
      const fallback = await supabase
        .from("messages")
        .select(legacyMessageColumns)
        .in("conversation_id", ids)
        .order("created_at", { ascending: false })
        .limit(600);

      messages = fallback.data as MessageRow[] | null;
      messagesError = fallback.error;
    }

    if (!messagesError) {
      (messages as MessageRow[] | null)?.forEach((message) => {
        if (!latestByConversation.has(message.conversation_id)) {
          latestByConversation.set(message.conversation_id, message);
        }

        const list = messagesByConversation.get(message.conversation_id) ?? [];
        if (list.length < 25) {
          list.push(mapMessage(message));
          messagesByConversation.set(message.conversation_id, list);
        }
      });
    }
  }

  return rows.map((row) => {
    const messages = (messagesByConversation.get(row.id) ?? []).reverse();
    return rowToConversation(row, latestByConversation.get(row.id), messages);
  });
}

export async function updateConversationBot(input: { id?: string; phone?: string; bot: boolean }) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const phone = normalizePhone(input.phone);
  let query = supabase
    .from("conversations")
    .update({
      bot_active: input.bot,
      bot_paused_reason: input.bot ? null : "Pausado desde dashboard",
      updated_at: new Date().toISOString()
    });

  if (input.id) {
    query = query.eq("id", input.id);
  } else if (phone) {
    query = query.eq("phone", phone);
  } else {
    throw new Error("Conversacion requerida.");
  }

  const { error } = await query;
  if (error) throw new Error(error.message);

  return readConversations();
}

export async function createManualConversationMessage(input: ManualMessageInput) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const body = input.body.trim().slice(0, 2000);
  if (!body) throw new Error("Mensaje requerido.");

  const phone = normalizePhone(input.phone);
  let conversationQuery = supabase.from("conversations").select("id");

  if (input.id) {
    conversationQuery = conversationQuery.eq("id", input.id);
  } else if (phone) {
    conversationQuery = conversationQuery.eq("phone", phone);
  } else {
    throw new Error("Conversacion requerida.");
  }

  const { data: conversation, error: conversationError } = await conversationQuery.maybeSingle();
  if (conversationError) throw new Error(conversationError.message);
  if (!conversation?.id) throw new Error("Conversacion no encontrada.");

  const now = new Date().toISOString();
  const metadata = {
    tipo: "manual",
    autor: "tienda",
    timestamp: now,
    provider: input.providerMessageId ? "ycloud" : "local",
    ycloud: input.deliveryPayload ?? null
  };

  const insertPayload = {
    conversation_id: conversation.id,
    direction: "outbound",
    body,
    source: "manual",
    metadata,
    provider_message_id: input.providerMessageId ?? null,
    delivery_status: input.deliveryStatus ?? (input.providerMessageId ? "sent" : "local"),
    sent_at: input.providerMessageId ? now : null
  };

  let { error: messageError } = await supabase.from("messages").insert(insertPayload);

  if (messageError && isMissingDeliveryColumn(messageError)) {
    const legacyPayload = {
      conversation_id: insertPayload.conversation_id,
      direction: insertPayload.direction,
      body: insertPayload.body,
      source: insertPayload.source,
      metadata: insertPayload.metadata
    };
    const legacyInsert = await supabase.from("messages").insert(legacyPayload);
    messageError = legacyInsert.error;
  }

  if (messageError) throw new Error(messageError.message);

  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      updated_at: now
    })
    .eq("id", conversation.id);

  if (updateError) throw new Error(updateError.message);

  return readConversations();
}

export async function createSyncedProviderMessage(input: SyncedProviderMessageInput) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const phone = normalizePhone(input.phone);
  if (!phone) throw new Error("Telefono requerido.");

  const body = input.body.trim().slice(0, 2000) || `[${input.attachmentType || "mensaje"}]`;
  const now = input.createdAt ?? new Date().toISOString();
  const providerMessageId = input.providerMessageId?.trim() || undefined;

  if (providerMessageId) {
    const { data: existing, error: existingError } = await supabase
      .from("messages")
      .select("id")
      .eq("provider_message_id", providerMessageId)
      .maybeSingle();

    if (existingError && !isMissingDeliveryColumn(existingError)) {
      throw new Error(existingError.message);
    }

    if (existing?.id) return false;
  }

  const { data: existingConversation, error: readConversationError } = await supabase
    .from("conversations")
    .select("id, customer_name")
    .eq("phone", phone)
    .maybeSingle();

  if (readConversationError) throw new Error(readConversationError.message);

  let conversationId = existingConversation?.id as string | undefined;
  if (!conversationId) {
    const { data: createdConversation, error: createConversationError } = await supabase
      .from("conversations")
      .insert({
        customer_name: input.customerName?.trim() || "Cliente WhatsApp",
        phone,
        bot_active: true,
        status: "nuevo",
        bot_stage: "nuevo",
        last_message_at: now
      })
      .select("id")
      .single();

    if (createConversationError) throw new Error(createConversationError.message);
    conversationId = createdConversation.id as string;
  }

  const metadata = {
    ...(input.metadata ?? {}),
    provider: "ycloud",
    attachmentUrl: input.attachmentUrl,
    attachmentType: input.attachmentType
  };

  const insertPayload = {
    conversation_id: conversationId,
    direction: input.direction,
    body,
    source: input.source,
    metadata,
    provider_message_id: providerMessageId ?? null,
    delivery_status: input.deliveryStatus ?? (input.direction === "outbound" ? "sent" : "local"),
    sent_at: input.direction === "outbound" ? now : null
  };

  let { error: messageError } = await supabase.from("messages").insert(insertPayload);

  if (messageError && isMissingDeliveryColumn(messageError)) {
    const legacyInsert = await supabase.from("messages").insert({
      conversation_id: insertPayload.conversation_id,
      direction: insertPayload.direction,
      body: insertPayload.body,
      source: insertPayload.source,
      metadata: insertPayload.metadata
    });
    messageError = legacyInsert.error;
  }

  if (messageError) throw new Error(messageError.message);

  const { error: updateError } = await supabase
    .from("conversations")
    .update({
      customer_name: existingConversation?.customer_name || input.customerName || "Cliente WhatsApp",
      last_message_at: now,
      updated_at: now
    })
    .eq("id", conversationId);

  if (updateError) throw new Error(updateError.message);
  return true;
}

export async function updateMessageDeliveryStatus(input: DeliveryStatusInput) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return false;

  const providerMessageId = input.providerMessageId.trim();
  if (!providerMessageId) return false;

  const now = input.occurredAt ?? new Date().toISOString();
  const status = input.status.toLowerCase();
  const timestampUpdates: Record<string, string> = {};

  if (status === "sent" || status === "accepted") timestampUpdates.sent_at = now;
  if (status === "delivered") timestampUpdates.delivered_at = now;
  if (status === "read") timestampUpdates.read_at = now;

  const { data: current, error: readError } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("provider_message_id", providerMessageId)
    .maybeSingle();

  if (readError || !current?.id) {
    if (readError && isMissingDeliveryColumn(readError)) return false;
    if (readError) throw new Error(readError.message);
    return false;
  }

  const metadata = (current.metadata ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("messages")
    .update({
      delivery_status: status,
      delivery_error: input.error ?? null,
      metadata: {
        ...metadata,
        ycloudDelivery: input.payload ?? null,
        deliveryUpdatedAt: now
      },
      ...timestampUpdates
    })
    .eq("id", current.id);

  if (error) {
    if (isMissingDeliveryColumn(error)) return false;
    throw new Error(error.message);
  }

  return true;
}
