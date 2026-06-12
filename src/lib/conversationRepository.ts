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
    const { data: messages, error: messagesError } = await supabase
      .from("messages")
      .select("id, conversation_id, direction, body, source, created_at, metadata")
      .in("conversation_id", ids)
      .order("created_at", { ascending: false })
      .limit(600);

    if (!messagesError) {
      (messages as MessageRow[] | null)?.forEach((message) => {
        if (!latestByConversation.has(message.conversation_id)) {
          latestByConversation.set(message.conversation_id, message);
        }

        const list = messagesByConversation.get(message.conversation_id) ?? [];
        if (list.length < 25) {
          const attachment = messageAttachment(message);
          list.push({
            id: message.id,
            direction: message.direction,
            body: message.body ?? "",
            createdAt: message.created_at ?? undefined,
            source: message.source ?? undefined,
            attachmentUrl: attachment.attachmentUrl,
            attachmentType: attachment.attachmentType
          });
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

export async function createManualConversationMessage(input: { id?: string; phone?: string; body: string }) {
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

  const { error: messageError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    direction: "outbound",
    body,
    source: "manual",
    metadata: {
      tipo: "manual",
      autor: "tienda",
      timestamp: now
    }
  });

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
