import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { updateOrder } from "@/lib/orderRepository";
import { evaluatePaymentMatchWithAi, type PaymentAgentCandidate } from "@/lib/paymentAiAgent";
import {
  extractMercantilPayerName,
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
  aiEmailEvidence?: unknown;
  ai_email_evidence?: unknown;
  ai?: {
    emailEvidence?: unknown;
    email_evidence?: unknown;
  };
  dryRun?: boolean;
}

interface AiEmailEvidence {
  isMercantilCreditQr?: boolean;
  amount?: number;
  concept?: string;
  payerName?: string;
  notificationNumber?: string;
  transactionAtText?: string;
  confidence?: number;
  safeToUse?: boolean;
  reason?: string;
}

interface MercantilPaymentEmail {
  amount: number;
  concept?: string;
  payerName?: string;
  notificationNumber?: string;
  transactionAtText?: string;
  emailId?: string;
  emailTimestamp?: string;
  aiEvidence?: AiEmailEvidence;
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

function parseAiEmailEvidence(payload: GmailPaymentPayload): AiEmailEvidence | null {
  const rawEvidence = payload.aiEmailEvidence ?? payload.ai_email_evidence ?? payload.ai?.emailEvidence ?? payload.ai?.email_evidence;
  if (!rawEvidence || typeof rawEvidence !== "object") return null;

  const evidence = rawEvidence as Record<string, unknown>;
  const amount =
    typeof evidence.amount === "number"
      ? evidence.amount
      : typeof evidence.amount === "string"
        ? parseMoneyValue(evidence.amount)
        : undefined;
  const confidence = Number(evidence.confidence);

  return {
    isMercantilCreditQr: evidence.isMercantilCreditQr === true,
    amount: Number.isFinite(amount) && amount && amount > 0 ? amount : undefined,
    concept: cleanText(evidence.concept, 160) || undefined,
    payerName: cleanText(evidence.payerName, 160) || undefined,
    notificationNumber: cleanText(evidence.notificationNumber, 80) || undefined,
    transactionAtText: cleanText(evidence.transactionAtText, 120) || undefined,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0,
    safeToUse: evidence.safeToUse !== false,
    reason: cleanText(evidence.reason, 240) || undefined
  };
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
  const aiEvidence = parseAiEmailEvidence(payload);
  const canUseAiEvidence = Boolean(aiEvidence?.safeToUse && (aiEvidence.confidence ?? 0) >= 0.8);
  if (!/Transferencia\s+QR/i.test(body) && !(canUseAiEvidence && aiEvidence?.isMercantilCreditQr)) return null;

  const amountMatch =
    body.match(/por un monto de Bs\.?\s*([\d.,]+)/i) ??
    body.match(/monto\s+de\s+Bs\.?\s*([\d.,]+)/i);
  const amount = amountMatch ? parseMoneyValue(amountMatch[1]) : canUseAiEvidence ? aiEvidence?.amount : undefined;
  if (!amount) return null;

  const conceptMatch = body.match(/por concepto de\s+(.+?),\s+a su cuenta/i);
  const transactionMatch = body.match(/La transacci[oó]n fue realizada el\s+(.+?)\./i);
  const notificationMatch = body.match(/n[uú]mero de notificaci[oó]n:\s*([A-Z0-9-]+)/i);

  return {
    amount,
    payerName: extractMercantilPayerName(body) || aiEvidence?.payerName,
    concept: cleanText(conceptMatch?.[1], 160) || aiEvidence?.concept,
    notificationNumber: cleanText(notificationMatch?.[1], 80) || aiEvidence?.notificationNumber,
    transactionAtText: cleanText(transactionMatch?.[1], 120) || aiEvidence?.transactionAtText,
    emailId: cleanText(payload.id ?? payload.messageId, 120) || undefined,
    emailTimestamp: cleanText(payload.timestamp ?? payload.email_ts, 80) || undefined,
    aiEvidence: aiEvidence || undefined,
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

function candidateToAiInput(candidate: PaymentRequestCandidate): PaymentAgentCandidate {
  const order = firstRelation(candidate.orders);
  const conversation = firstRelation(candidate.conversations);

  return {
    id: candidate.id,
    orderNumber: order?.order_number,
    customerName: order?.customer_name ?? conversation?.customer_name,
    customerPhone: order?.customer_phone ?? conversation?.phone,
    amount: Number(candidate.amount),
    paymentChoice: candidate.payment_choice,
    requestedAt: candidate.requested_at,
    proof: proofEvidenceFromPayload(candidate.verification_payload)
  };
}

function aiDecisionIsSafe(candidate: PaymentRequestCandidate, payment: MercantilPaymentEmail, decisionReason: string) {
  const proof = proofEvidenceFromPayload(candidate.verification_payload);

  if (candidate.status !== "proof_received") return { ok: false, reason: "ai_rejected_without_customer_proof" };
  if (!sameMoney(candidate.amount, payment.amount)) return { ok: false, reason: "ai_rejected_amount_mismatch" };
  if (proof.amount !== undefined && !sameMoney(proof.amount, payment.amount)) {
    return { ok: false, reason: "ai_rejected_proof_amount_mismatch" };
  }

  return { ok: true, reason: decisionReason };
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
    const proofReferenceMatches =
      !proof.reference ||
      `${payment.concept ?? ""} ${payment.notificationNumber ?? ""}`.toLowerCase().includes(proof.reference.toLowerCase());

    return proofAmountMatches && proofReferenceMatches;
  });

  if (proofEvidenceMatches.length === 1) return { match: proofEvidenceMatches[0], reason: "proof_evidence_and_amount" };
  if (proofEvidenceMatches.length > 1) return { match: null, reason: "ambiguous_proof_evidence" };
  if (proofMatches.length === 1 && candidates.length === 1) return { match: proofMatches[0], reason: "single_proof_received_and_amount" };

  return { match: null, reason: "ambiguous_amount" };
}

async function chooseCandidateWithAi(candidates: PaymentRequestCandidate[], payment: MercantilPaymentEmail) {
  const proofCandidates = candidates.filter((candidate) => candidate.status === "proof_received");
  if (!proofCandidates.length) return { match: null, reason: "ai_skipped_no_proof_candidates" };

  const decision = await evaluatePaymentMatchWithAi(payment, proofCandidates.map(candidateToAiInput));
  if (!decision) return { match: null, reason: "ai_unavailable" };
  if (decision.decision !== "confirm") return { match: null, reason: `ai_${decision.decision}:${decision.reason}` };
  if (!decision.amountMatch) return { match: null, reason: "ai_amount_not_confirmed" };
  if (decision.confidence < Number(process.env.PAYMENT_AI_MIN_CONFIDENCE ?? 0.78)) {
    return { match: null, reason: `ai_low_confidence:${decision.confidence}` };
  }

  const match = proofCandidates.find((candidate) => candidate.id === decision.candidateId);
  if (!match) return { match: null, reason: "ai_candidate_not_found" };

  const safe = aiDecisionIsSafe(match, payment, `ai_verified:${decision.reason}`);
  if (!safe.ok) return { match: null, reason: safe.reason };

  return { match, reason: safe.reason };
}

async function recordMercantilEmail(
  supabase: SupabaseClient,
  payment: MercantilPaymentEmail,
  matchStatus: "unmatched" | "matched" | "manual_review",
  matchReason: string,
  matchedPaymentRequestId?: string
) {
  const row = {
    email_id: payment.emailId ?? null,
    amount: payment.amount,
    payer_name: payment.payerName ?? null,
    concept: payment.concept ?? null,
    notification_number: payment.notificationNumber ?? null,
    transaction_at_text: payment.transactionAtText ?? null,
    email_timestamp: payment.emailTimestamp ?? null,
    body: payment.body,
    match_status: matchStatus,
    matched_payment_request_id: matchedPaymentRequestId ?? null,
    match_reason: matchReason
  };

  const query = payment.emailId
    ? supabase.from("mercantil_payment_emails").upsert(row, { onConflict: "email_id" })
    : supabase.from("mercantil_payment_emails").insert(row);
  const { error } = await query;

  if (error && error.code !== "42P01") {
    console.warn("Mercantil email audit insert failed.", error.message);
  }
}

async function wasMercantilEmailAlreadyMatched(supabase: SupabaseClient, payment: MercantilPaymentEmail) {
  if (!payment.emailId) return false;

  const { data, error } = await supabase
    .from("mercantil_payment_emails")
    .select("email_id, match_status, matched_payment_request_id")
    .eq("email_id", payment.emailId)
    .maybeSingle();

  if (error) {
    if (error.code !== "42P01") {
      console.warn("Mercantil email duplicate check failed.", error.message);
    }
    return false;
  }

  return data?.match_status === "matched" || Boolean(data?.matched_payment_request_id);
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
    const alreadyMatched = await wasMercantilEmailAlreadyMatched(supabase, payment);
    if (alreadyMatched) {
      return NextResponse.json(
        { ok: true, matched: false, ignored: true, reason: "mercantil_email_already_matched", emailId: payment.emailId },
        { headers: secureJsonHeaders(request) }
      );
    }

    const candidates = await findCandidates(supabase, payment);
    let { match, reason } = chooseCandidate(candidates, payment);
    if (!match && candidates.length) {
      const aiMatch = await chooseCandidateWithAi(candidates, payment);
      match = aiMatch.match;
      reason = aiMatch.reason;
    }

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
      await recordMercantilEmail(supabase, payment, "manual_review", reason);
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
    await recordMercantilEmail(supabase, payment, "matched", reason, match.id);
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
