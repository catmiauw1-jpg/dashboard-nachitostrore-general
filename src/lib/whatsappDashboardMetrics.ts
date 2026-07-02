import type { Conversation, Order } from "../types/index.ts";

export interface WhatsAppDashboardMetrics {
  manualChats: number;
  paymentsToReview: number;
  waitingForProof: number;
}

function normalized(value?: string) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isClosedOrder(order: Order) {
  return order.status === "Cancelado" || order.status === "Entregado";
}

export function hasPaymentProof(order: Order) {
  return Boolean(
    order.paymentProofUrls?.length ||
      order.referenceImages?.some((reference) => /comprobante|proof|pago/i.test(reference))
  );
}

export function isManualConversation(chat: Conversation) {
  const state = `${normalized(chat.stage)} ${normalized(chat.status)}`;
  return !chat.bot || state.includes("atencion manual") || state.includes("manual");
}

export function isPaymentReviewOrder(order: Order) {
  if (isClosedOrder(order) || order.payment === "Pago completo") return false;
  return Boolean(order.requiresManualReview) || (order.payment === "Pendiente" && hasPaymentProof(order));
}

export function isWaitingForPaymentProof(order: Order) {
  if (isClosedOrder(order) || order.payment === "Pago completo" || hasPaymentProof(order) || order.requiresManualReview) {
    return false;
  }

  const botStatus = normalized(order.botStatus);
  const paymentRequestCreated =
    botStatus.includes("esperando comprobante") ||
    Boolean(order.paymentChoice) ||
    Number(order.paymentAmountDue ?? 0) > 0;

  return paymentRequestCreated;
}

export function getWhatsAppDashboardMetrics(
  chats: Conversation[],
  orders: Order[]
): WhatsAppDashboardMetrics {
  let manualChats = 0;
  let paymentsToReview = 0;
  let waitingForProof = 0;

  for (const chat of chats) {
    if (isManualConversation(chat)) manualChats += 1;
  }

  for (const order of orders) {
    if (isClosedOrder(order)) continue;
    if (isPaymentReviewOrder(order)) paymentsToReview += 1;
    if (isWaitingForPaymentProof(order)) waitingForProof += 1;
  }

  return { manualChats, paymentsToReview, waitingForProof };
}
