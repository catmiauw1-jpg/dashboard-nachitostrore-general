import type { Conversation, ConversationMessage } from "../types/index.ts";

export interface RealtimeMessageRow {
  id?: unknown;
  conversation_id?: unknown;
  direction?: unknown;
  body?: unknown;
  source?: unknown;
  metadata?: unknown;
  created_at?: unknown;
  provider_message_id?: unknown;
  delivery_status?: unknown;
  delivery_error?: unknown;
  sent_at?: unknown;
  delivered_at?: unknown;
  read_at?: unknown;
}

const conversationRefreshFields = [
  "customer_name",
  "phone",
  "bot_active",
  "status",
  "bot_stage",
  "payment_flow"
] as const;

export function hasMeaningfulConversationChange(
  previous: Record<string, unknown>,
  next: Record<string, unknown>
) {
  return conversationRefreshFields.some((field) =>
    JSON.stringify(previous[field]) !== JSON.stringify(next[field])
  );
}

function optionalString(value: unknown) {
  return typeof value === "string" && value ? value : undefined;
}

function messageAttachment(metadata: unknown) {
  const values = metadata && typeof metadata === "object" ? metadata as Record<string, unknown> : {};
  const details = values.attachmentDetails && typeof values.attachmentDetails === "object"
    ? values.attachmentDetails as Record<string, unknown>
    : {};
  const raw = values.raw && typeof values.raw === "object" ? values.raw as Record<string, unknown> : {};

  return {
    attachmentUrl: optionalString(values.attachmentUrl) ?? optionalString(details.url),
    attachmentType:
      optionalString(values.attachmentType) ??
      optionalString(details.mimeType) ??
      optionalString(details.type) ??
      optionalString(raw.type)
  };
}

function toConversationMessage(row: RealtimeMessageRow): ConversationMessage | null {
  if (
    typeof row.id !== "string" ||
    (row.direction !== "inbound" && row.direction !== "outbound") ||
    typeof row.body !== "string"
  ) {
    return null;
  }

  const attachment = messageAttachment(row.metadata);
  const createdAt = optionalString(row.created_at);
  const source = optionalString(row.source);
  const providerMessageId = optionalString(row.provider_message_id);
  const deliveryStatus = optionalString(row.delivery_status);
  const validDeliveryStatuses = new Set<NonNullable<ConversationMessage["deliveryStatus"]>>([
    "local",
    "accepted",
    "sent",
    "delivered",
    "read",
    "failed"
  ]);
  const normalizedDeliveryStatus = deliveryStatus && validDeliveryStatuses.has(
    deliveryStatus as NonNullable<ConversationMessage["deliveryStatus"]>
  )
    ? deliveryStatus as NonNullable<ConversationMessage["deliveryStatus"]>
    : undefined;
  const deliveryError = optionalString(row.delivery_error);
  const sentAt = optionalString(row.sent_at);
  const deliveredAt = optionalString(row.delivered_at);
  const readAt = optionalString(row.read_at);

  return {
    id: row.id,
    direction: row.direction,
    body: row.body,
    ...(createdAt ? { createdAt } : {}),
    ...(source ? { source } : {}),
    ...(attachment.attachmentUrl ? { attachmentUrl: attachment.attachmentUrl } : {}),
    ...(attachment.attachmentType ? { attachmentType: attachment.attachmentType } : {}),
    ...(providerMessageId ? { providerMessageId } : {}),
    ...(normalizedDeliveryStatus ? { deliveryStatus: normalizedDeliveryStatus } : {}),
    ...(deliveryError ? { deliveryError } : {}),
    ...(sentAt ? { sentAt } : {}),
    ...(deliveredAt ? { deliveredAt } : {}),
    ...(readAt ? { readAt } : {})
  };
}

function messageTime(message: ConversationMessage) {
  const time = message.createdAt ? new Date(message.createdAt).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function conversationTime(conversation: Conversation) {
  const time = conversation.lastMessageAt ? new Date(conversation.lastMessageAt).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

export function mergeRealtimeMessage(chats: Conversation[], row: RealtimeMessageRow): Conversation[] {
  if (typeof row.conversation_id !== "string") return chats;

  const chatIndex = chats.findIndex((chat) => chat.id === row.conversation_id);
  const message = toConversationMessage(row);
  if (chatIndex < 0 || !message) return chats;

  const chat = chats[chatIndex];
  const currentMessages = chat.messages ?? [];
  const messageIndex = currentMessages.findIndex((currentMessage) => currentMessage.id === message.id);
  const nextMessages = messageIndex < 0
    ? [...currentMessages, message]
    : currentMessages.map((currentMessage, index) =>
        index === messageIndex ? { ...currentMessage, ...message } : currentMessage
      );
  const sortedMessages = [...nextMessages].sort((left, right) => messageTime(left) - messageTime(right));
  const latestMessage = sortedMessages.at(-1);
  const nextChat: Conversation = {
    ...chat,
    messages: sortedMessages,
    lastMessage: latestMessage?.body ?? chat.lastMessage,
    lastMessageAt: latestMessage?.createdAt ?? chat.lastMessageAt
  };

  return chats
    .map((currentChat, index) => (index === chatIndex ? nextChat : currentChat))
    .sort((left, right) => conversationTime(right) - conversationTime(left));
}
