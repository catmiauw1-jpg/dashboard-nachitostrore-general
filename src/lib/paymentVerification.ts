import { cleanText } from "@/lib/requestSecurity";

export interface PaymentProofEvidence {
  amount?: number;
  payerName?: string;
  reference?: string;
  notificationNumber?: string;
  rawText?: string;
}

export function parseMoneyValue(value: string) {
  const trimmed = value.trim().replace(/[.,]+$/, "");
  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");
  const normalized =
    hasComma && hasDot
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : hasComma
        ? trimmed.replace(",", ".")
        : trimmed;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

export function sameMoney(left: unknown, right: unknown) {
  return Math.abs(Number(left) - Number(right)) < 0.01;
}

export function normalizeComparableText(value: unknown) {
  return cleanText(value, 240)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizePersonName(value: unknown) {
  return normalizeComparableText(value)
    .replace(/\b(srl|sa|s a|banco|cliente|whatsapp|qr|transferencia)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesLookRelated(left: unknown, right: unknown) {
  const a = normalizePersonName(left);
  const b = normalizePersonName(right);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;

  const aWords = new Set(a.split(" ").filter((word) => word.length > 2));
  const bWords = b.split(" ").filter((word) => word.length > 2);
  const common = bWords.filter((word) => aWords.has(word));

  return common.length >= Math.min(2, Math.max(1, Math.min(aWords.size, bWords.length)));
}

export function extractMercantilPayerName(body: string) {
  const match =
    body.match(/de la cuenta\s+\d+\s+de\s+(.+?)\s+del\s+BANCO/i) ??
    body.match(/de la cuenta\s+\d+\s+de\s+(.+?),\s+por un monto/i);

  return cleanText(match?.[1], 160) || undefined;
}

export function parseProofEvidence(value: unknown): PaymentProofEvidence {
  const rawText = cleanText(value, 6000);
  if (!rawText) return {};

  const amountMatch =
    rawText.match(/(?:bs|bob)\s*([\d.,]+)/i) ??
    rawText.match(/(?:monto|importe|total|pagado)\D{0,20}([\d.,]+)/i);
  const payerMatch =
    rawText.match(/(?:de|nombre|titular|ordenante|remitente|cliente)\s*[:\-]?\s*([A-ZÁÉÍÓÚÑ ]{5,80})/i) ??
    rawText.match(/\b([A-ZÁÉÍÓÚÑ]{3,}\s+[A-ZÁÉÍÓÚÑ]{3,}(?:\s+[A-ZÁÉÍÓÚÑ]{3,}){0,3})\b/);
  const referenceMatch = rawText.match(/\b((?:PED|WEB|BOT)-?\d{4,}|NTR-\d+)\b/i);
  const notificationMatch = rawText.match(/\b(NTR-\d+)\b/i);

  return {
    amount: amountMatch ? parseMoneyValue(amountMatch[1]) : undefined,
    payerName: cleanText(payerMatch?.[1], 160) || undefined,
    reference: cleanText(referenceMatch?.[1], 80) || undefined,
    notificationNumber: cleanText(notificationMatch?.[1], 80) || undefined,
    rawText
  };
}

export function proofEvidenceFromPayload(payload: Record<string, unknown> | null | undefined): PaymentProofEvidence {
  const proof = (payload?.proof ?? payload?.proofEvidence ?? {}) as Record<string, unknown>;

  return {
    amount: proof.amount !== undefined ? Number(proof.amount) : undefined,
    payerName: cleanText(proof.payerName, 160) || undefined,
    reference: cleanText(proof.reference, 80) || undefined,
    notificationNumber: cleanText(proof.notificationNumber, 80) || undefined,
    rawText: cleanText(proof.rawText, 6000) || undefined
  };
}
