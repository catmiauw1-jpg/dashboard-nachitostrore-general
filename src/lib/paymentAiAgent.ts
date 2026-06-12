import { cleanText } from "@/lib/requestSecurity";

export interface PaymentAgentEmail {
  amount: number;
  concept?: string;
  payerName?: string;
  notificationNumber?: string;
  transactionAtText?: string;
  emailId?: string;
  emailTimestamp?: string;
}

export interface PaymentAgentCandidate {
  id: string;
  orderNumber?: string | null;
  customerName?: string | null;
  customerPhone?: string | null;
  amount: number;
  paymentChoice: "50%" | "completo";
  requestedAt?: string | null;
  proof?: {
    amount?: number;
    payerName?: string;
    reference?: string;
    notificationNumber?: string;
    rawText?: string;
  };
}

export interface PaymentAgentDecision {
  candidateId?: string;
  decision: "confirm" | "manual_review" | "reject";
  confidence: number;
  amountMatch: boolean;
  payerNameMatch: "match" | "partial" | "unknown" | "mismatch";
  referenceMatch: "match" | "partial" | "unknown" | "mismatch";
  reason: string;
}

const defaultAgentPrompt = [
  "Eres un verificador de pagos para Nachito Store.",
  "Debes comparar un correo real del Banco Mercantil Santa Cruz con comprobantes enviados por WhatsApp.",
  "Nunca confirmes si el monto no coincide exactamente.",
  "Nunca confirmes si no hay correo Mercantil.",
  "Si hay varios pedidos posibles y no puedes elegir uno con alta seguridad, usa manual_review.",
  "Si el comprobante no tiene nombre claro, puedes confirmar solo si hay un unico candidato con el mismo monto y referencia compatible.",
  "Devuelve SOLO JSON valido."
].join("\n");

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;

  try {
    return JSON.parse(source) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeDecision(parsed: Record<string, unknown> | null): PaymentAgentDecision | null {
  if (!parsed) return null;

  const decision = cleanText(parsed.decision, 40).toLowerCase();
  const normalizedDecision =
    decision === "confirm" || decision === "confirmed"
      ? "confirm"
      : decision === "reject" || decision === "rejected"
        ? "reject"
        : "manual_review";

  const payerNameMatch = cleanText(parsed.payerNameMatch ?? parsed.payer_name_match, 40).toLowerCase();
  const referenceMatch = cleanText(parsed.referenceMatch ?? parsed.reference_match, 40).toLowerCase();

  return {
    candidateId: cleanText(parsed.candidateId ?? parsed.candidate_id, 120) || undefined,
    decision: normalizedDecision,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
    amountMatch: Boolean(parsed.amountMatch ?? parsed.amount_match),
    payerNameMatch:
      payerNameMatch === "match" || payerNameMatch === "partial" || payerNameMatch === "mismatch"
        ? payerNameMatch
        : "unknown",
    referenceMatch:
      referenceMatch === "match" || referenceMatch === "partial" || referenceMatch === "mismatch"
        ? referenceMatch
        : "unknown",
    reason: cleanText(parsed.reason, 240) || "Sin explicacion del agente."
  };
}

function buildAgentUserPrompt(payment: PaymentAgentEmail, candidates: PaymentAgentCandidate[]) {
  return [
    "Correo Mercantil:",
    JSON.stringify(payment, null, 2),
    "",
    "Pedidos candidatos:",
    JSON.stringify(candidates, null, 2),
    "",
    "Responde con este JSON exacto:",
    JSON.stringify(
      {
        candidateId: "payment_request_id o null",
        decision: "confirm | manual_review | reject",
        confidence: 0.0,
        amountMatch: true,
        payerNameMatch: "match | partial | unknown | mismatch",
        referenceMatch: "match | partial | unknown | mismatch",
        reason: "explicacion corta"
      },
      null,
      2
    )
  ].join("\n");
}

async function callOpenAiCompatible(messages: Array<{ role: "system" | "user"; content: string }>) {
  const baseUrl = cleanText(process.env.PAYMENT_AI_BASE_URL, 500).replace(/\/$/, "");
  const model = cleanText(process.env.PAYMENT_AI_MODEL, 120);
  if (!baseUrl || !model) return null;

  const apiKey = process.env.PAYMENT_AI_API_KEY;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0,
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) return null;
  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return cleanText(json.choices?.[0]?.message?.content, 5000);
}

async function callOllama(messages: Array<{ role: "system" | "user"; content: string }>) {
  const baseUrl = (cleanText(process.env.PAYMENT_AI_BASE_URL, 500) || "http://127.0.0.1:11434").replace(/\/$/, "");
  const model = cleanText(process.env.PAYMENT_AI_MODEL, 120);
  if (!model) return null;

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      stream: false,
      format: "json",
      options: { temperature: 0 }
    })
  });

  if (!response.ok) return null;
  const json = (await response.json()) as { message?: { content?: string } };
  return cleanText(json.message?.content, 5000);
}

export async function evaluatePaymentMatchWithAi(
  payment: PaymentAgentEmail,
  candidates: PaymentAgentCandidate[]
): Promise<PaymentAgentDecision | null> {
  if (!candidates.length) return null;

  const provider = cleanText(process.env.PAYMENT_AI_PROVIDER, 60).toLowerCase();
  if (!provider || provider === "disabled" || provider === "none") return null;

  const messages: Array<{ role: "system" | "user"; content: string }> = [
    { role: "system", content: process.env.PAYMENT_AI_SYSTEM_PROMPT || defaultAgentPrompt },
    { role: "user", content: buildAgentUserPrompt(payment, candidates) }
  ];

  const output =
    provider === "ollama"
      ? await callOllama(messages)
      : await callOpenAiCompatible(messages);

  return normalizeDecision(parseJsonObject(output ?? ""));
}
