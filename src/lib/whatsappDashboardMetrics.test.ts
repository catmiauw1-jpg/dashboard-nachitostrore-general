import assert from "node:assert/strict";
import test from "node:test";
import type { Conversation, Order } from "../types/index.ts";
import { getWhatsAppDashboardMetrics } from "./whatsappDashboardMetrics.ts";

function chat(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "chat-1",
    name: "Cliente",
    phone: "59170000000",
    bot: true,
    alert: false,
    status: "Bot activo",
    ...overrides
  };
}

function order(overrides: Partial<Order> = {}): Order {
  return {
    id: "#WEB-1",
    customer: "Cliente",
    customerPhone: "59170000000",
    type: "Catálogo",
    product: "Polera",
    prendas: 1,
    total: 125,
    payment: "Pendiente",
    status: "Esperando pago",
    delivery: "Recoger",
    channel: "Web",
    source: "Web catálogo",
    ...overrides
  };
}

test("an alert does not make an active bot conversation manual", () => {
  const metrics = getWhatsAppDashboardMetrics([chat({ alert: true })], []);

  assert.equal(metrics.manualChats, 0);
});

test("counts paused and explicitly manual conversations", () => {
  const metrics = getWhatsAppDashboardMetrics(
    [chat({ id: "paused", bot: false }), chat({ id: "manual", stage: "atencion_manual" })],
    []
  );

  assert.equal(metrics.manualChats, 2);
});

test("counts only payment requests that are actually waiting for proof", () => {
  const metrics = getWhatsAppDashboardMetrics([], [
    order({ id: "plain-pending" }),
    order({ id: "qr-sent", botStatus: "Esperando comprobante", paymentAmountDue: 62.5 }),
    order({ id: "proof", paymentProofUrls: ["https://example.com/proof.jpg"] }),
    order({ id: "review", requiresManualReview: true }),
    order({
      id: "half-paid-with-proof",
      payment: "50% pagado",
      status: "En preparación",
      paymentProofUrls: ["https://example.com/half-confirmed.jpg"]
    }),
    order({ id: "paid", payment: "Pago completo", status: "En preparación" }),
    order({
      id: "paid-with-proof",
      payment: "Pago completo",
      status: "En preparación",
      paymentProofUrls: ["https://example.com/confirmed.jpg"]
    }),
    order({ id: "cancelled", status: "Cancelado", botStatus: "Esperando comprobante" })
  ]);

  assert.equal(metrics.waitingForProof, 1);
  assert.equal(metrics.paymentsToReview, 2);
});
