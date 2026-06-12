import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateOrder } from "@/lib/orderRepository";
import {
  extractMercantilPayerName,
  namesLookRelated,
  parseMoneyValue,
  proofEvidenceFromPayload,
  sameMoney
} from "@/lib/paymentVerification";
import { RequestSecurityError, assertBodySize, cleanText, secureJsonHeaders } from "@/lib/requestSecurity";
import { requireSupabaseAdminClient } from "@/lib/supabase";

const maxBodyBytes = 256 * 1024;
const mercantilSender = "bmscsa@bmsc.com.bo";

interface GmailPaymentPayload {
  id?: string;
  messageId?: string;
  from?: unknown;
  subject?: string;
  snippet?: string;
  body?: string;
  text?: string;
  textPlain?: string;
  textHtml?: string;
  html?: string;
  timestamp?: string;
  email_ts?: string;
  dryRun?: boolean;
}

interface MercantilPaymentEmail {
  amount: number;
  concept?: string;
  payerName?: string;
  notificationNumber?: string;
  transactionAtText?: string;
  emailId?: string;
  emailTimestamp?: string;
  body: string;
}

interface PaymentRequestCandidate {
  id: string;
  order_id: string | null;
  conversation_id: string | null;
  amount: number | string;
  status: string;
  payment_choice: "50%" | "completo";
  requested_at: string;
  external_reference: string | null;
  verification_payload: Record<string, unknown> | null;
  orders?: {
    id: string;
    order_number: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    order_status: string | null;
    payment_status: string | null;
  } | Array<{
    id: string;
    order_number: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    order_status: string | null;
    payment_status: string | null;
  }> | null;
  conversations?: {
    id: string;
    phone: string | null;
    customer_name: string | null;
  } | Array<{
    id: string;
    phone: string | null;
    customer_name: string | null;
  }> | null;
}

function webhookSecret() {
  return process.env.N8N_WEBHOOK_SECRET || process.env.POLERAFLOW_WEBHOOK_SECRET;
}

function hasValidSecret(request: Request) {
  const secret = webhookSecret();
  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-poleraflow-webhook-secret") ?? "";

  return Boolean(secret && (auth === `Bearer ${secret}` || headerSecret === secret));
}

function normalizeBody(value: unknown) {
  return cleanText(value, 30_000);
}

function searchableText(value: unknown) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function stripHtml(value: unknown) {
  return searchableText(value)
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&aacute;/gi, "a")
    .replace(/&eacute;/gi, "e")
    .replace(/&iacute;/gi, "i")
    .replace(/&oacute;/gi, "o")
    .replace(/&uacute;/gi, "u")
    .replace(/&ntilde;/gi, "n");
}

function firstRelation<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function parseMercantilEmail(payload: GmailPaymentPayload): MercantilPaymentEmail | null {
  const body = normalizeBody(
    [
      payload.body,
      payload.text,
      payload.textPlain,
      stripHtml(payload.textHtml ?? payload.html),
      payload.snippet
    ].filter(Boolean).join("\n")
  );
  if (!body) return null;
  if (/D\S{0,6}bito\s+Transferencia/i.test(body)) return null;
  if (!/Transferencia\s+QR/i.test(body)) return null;

  const amountMatch =
    body.match(/por un monto de Bs\.?\s*([\d.,]+)/i) ??
    body.match(/monto\s+de\s+Bs\.?\s*([\d.,]+)/i);
  if (!amountMatch) return null;

  const conceptMatch = body.match(/por concepto de\s+(.+?),\s+a su cuenta/i);
  const transactionMatch = body.match(/La transacci[oó]n fue realizada el\s+(.+?)\./i);
  const notificationMatch = body.match(/n[uú]mero de notificaci[oó]n:\s*([A-Z0-9-]+)/i);

  return {
    amount: parseMoneyValue(amountMatch[1]),
    payerName: extractMercantilPayerName(body),
    concept: cleanText(conceptMatch?.[1], 160) || undefined,
    notificationNumber: cleanText(notificationMatch?.[1], 80) || undefined,
    transactionAtText: cleanText(transactionMatch?.[1], 120) || undefined,
    emailId: cleanText(payload.id ?? payload.messageId, 120) || undefined,
    emailTimestamp: cleanText(payload.timestamp ?? payload.email_ts, 80) || undefined,
    body
  };
}

function isMercantilSender(payload: GmailPaymentPayload) {
  const from = searchableText(payload.from).toLowerCase();
  const body = searchableText(payload.body ?? payload.text ?? payload.textPlain ?? payload.textHtml ?? payload.html ?? payload.snippet).toLowerCase();

  return from.includes(mercantilSender) || body.includes("banco mercantil santa cruz");
}

function paymentConfirmationText(customerName: string) {
  return "✅ *Pago confirmado. ¡Tu pedido entra a producción!* 🎉\nTu polera estará lista en *2 a 4 días hábiles.*\nTe avisamos cuando esté lista. 👕";
}

async function findCandidates(supabase: SupabaseClient, payment: MercantilPaymentEmail) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("payment_requests")
    .select(
      "id, order_id, conversation_id, amount, status, payment_choice, requested_at, external_reference, verification_payload, orders(id, order_number, customer_name, customer_phone, order_status, payment_status), conversations(id, phone, customer_name)"
    )
    .in("status", ["pending", "proof_received"])
    .gte("requested_at", since)
    .order("requested_at", { ascending: false })
    .limit(25);

  if (error) throw error;

  return ((data ?? []) as unknown as PaymentRequestCandidate[]).filter((candidate) => sameMoney(candidate.amount, payment.amount));
}

function chooseCandidate(candidates: PaymentRequestCandidate[], payment: MercantilPaymentEmail) {
  if (!candidates.length) return { match: null, reason: "no_amount_match" };

  const concept = `${payment.concept ?? ""}`.toLowerCase();
  const referenceMatches = candidates.filter((candidate) => {
    const order = firstRelation(candidate.orders);
    const orderNumber = order?.order_number?.toLowerCase() ?? "";
    const externalReference = candidate.external_reference?.toLowerCase() ?? "";
    return Boolean((orderNumber && concept.includes(orderNumber)) || (externalReference && concept.includes(externalReference)));
  });

  if (referenceMatches.length === 1) return { match: referenceMatches[0], reason: "reference_and_amount" };
  if (referenceMatches.length > 1) return { match: null, reason: "ambiguous_reference" };

  const proofMatches = candidates.filter((candidate) => candidate.status === "proof_received");
  const proofEvidenceMatches = proofMatches.filter((candidate) => {
    const proof = proofEvidenceFromPayload(candidate.verification_payload);
    const proofAmountMatches = proof.amount === undefined || sameMoney(proof.amount, payment.amount);
    const proofNameMatches =
      !payment.payerName ||
      !proof.payerName ||
      namesLookRelated(proof.payerName, payment.payerName);
    const proofReferenceMatches =
      !proof.reference ||
      `${payment.concept ?? ""} ${payment.notificationNumber ?? ""}`.toLowerCase().includes(proof.reference.toLowerCase());

    return proofAmountMatches && proofNameMatches && proofReferenceMatches;
  });

  if (proofEvidenceMatches.length === 1) return { match: proofEvidenceMatches[0], reason: "proof_evidence_and_amount" };
  if (proofEvidenceMatches.length > 1) return { match: null, reason: "ambiguous_proof_evidence" };
  if (proofMatches.length === 1 && candidates.length === 1) return { match: proofMatches[0], reason: "single_proof_received_and_amount" };

  return { match: null, reason: "ambiguous_amount" };
}

async function confirmPayment(supabase: SupabaseClient, candidate: PaymentRequestCandidate, payment: MercantilPaymentEmail, reason: string) {
  const now = new Date().toISOString();
  const paymentStatus = candidate.payment_choice === "50%" ? "50% pagado" : "Pago completo";
  const order = firstRelation(candidate.orders);
  const conversation = firstRelation(candidate.conversations);
  const customerName = order?.customer_name ?? conversation?.customer_name ?? "cliente WhatsApp";

  await supabase
    .from("payment_requests")
    .update({
      status: "verified",
      verified_at: now,
      verification_payload: {
        ...(candidate.verification_payload ?? {}),
        verifier: "gmail_mercantil",
        confidence: reason,
        mercantil: {
          emailId: payment.emailId,
          amount: payment.amount,
          concept: payment.concept,
          payerName: payment.payerName,
          notificationNumber: payment.notificationNumber,
          transactionAtText: payment.transactionAtText,
          emailTimestamp: payment.emailTimestamp
        }
      }
    })
    .eq("id", candidate.id);

  if (order?.order_number) {
    await updateOrder(order.order_number, {
      payment: paymentStatus,
      status: "En preparaci\u00F3n",
      botStatus: "Bot registrado",
      notes: `Pago verificado por correo Mercantil: ${payment.notificationNumber ?? payment.emailId ?? "sin codigo"}`
    });

    await supabase
      .from("orders")
      .update({
        payment_verified_at: now,
        requires_manual_review: false,
        bot_stage: "pago_confirmado"
      })
      .eq("id", order.id);
  }

  if (candidate.conversation_id) {
    await supabase
      .from("conversations")
      .update({
        bot_stage: "pago_confirmado",
        status: "pago_confirmado",
        last_message_at: now
      })
      .eq("id", candidate.conversation_id);
  }

  await supabase.from("bot_events").insert({
    conversation_id: candidate.conversation_id,
    order_id: candidate.order_id,
    event_type: "payment_verified_by_gmail",
    previous_stage: candidate.status,
    next_stage: "pago_confirmado",
    payload: {
      reason,
      paymentRequestId: candidate.id,
      mercantil: {
        amount: payment.amount,
        concept: payment.concept,
        payerName: payment.payerName,
        notificationNumber: payment.notificationNumber,
        emailId: payment.emailId
      }
    },
    source: "gmail-mercantil"
  });

  return {
    customerName,
    phone: order?.customer_phone ?? conversation?.phone ?? null,
    orderNumber: order?.order_number ?? null,
    paymentStatus
  };
}

export async function POST(request: Request) {
  try {
    assertBodySize(request, maxBodyBytes);

    if (!hasValidSecret(request)) {
      throw new RequestSecurityError("Webhook no autorizado.", 401);
    }

    const payload = (await request.json()) as GmailPaymentPayload;
    if (!isMercantilSender(payload)) {
      return NextResponse.json({ ok: true, matched: false, ignored: true, reason: "not_mercantil_sender" }, { headers: secureJsonHeaders(request) });
    }

    const payment = parseMercantilEmail(payload);
    if (!payment) {
      return NextResponse.json({ ok: true, matched: false, ignored: true, reason: "not_credit_qr_payment" }, { headers: secureJsonHeaders(request) });
    }

    const supabase = requireSupabaseAdminClient();
    const candidates = await findCandidates(supabase, payment);
    const { match, reason } = chooseCandidate(candidates, payment);

    if (payload.dryRun) {
      return NextResponse.json(
        {
          ok: true,
          dryRun: true,
          matched: Boolean(match),
          reason,
          parsed: {
            amount: payment.amount,
            concept: payment.concept,
            payerName: payment.payerName,
            notificationNumber: payment.notificationNumber,
            transactionAtText: payment.transactionAtText
          },
          candidateCount: candidates.length
        },
        { headers: secureJsonHeaders(request) }
      );
    }

    if (!match) {
      await supabase.from("bot_events").insert({
        event_type: "payment_gmail_unmatched",
        payload: {
          reason,
          amount: payment.amount,
          concept: payment.concept,
          payerName: payment.payerName,
          notificationNumber: payment.notificationNumber,
          candidateCount: candidates.length,
          emailId: payment.emailId
        },
        source: "gmail-mercantil"
      });

      return NextResponse.json(
        {
          ok: true,
          matched: false,
          needsManualReview: true,
          reason,
          amount: payment.amount,
          candidateCount: candidates.length
        },
        { headers: secureJsonHeaders(request) }
      );
    }

    const confirmed = await confirmPayment(supabase, match, payment, reason);
    const replyText = paymentConfirmationText(confirmed.customerName);

    return NextResponse.json(
      {
        ok: true,
        matched: true,
        reason,
        paymentRequestId: match.id,
        orderNumber: confirmed.orderNumber,
        phone: confirmed.phone,
        paymentStatus: confirmed.paymentStatus,
        replyText
      },
      { headers: secureJsonHeaders(request) }
    );
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo verificar el pago Mercantil.";

    return NextResponse.json({ ok: false, error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
