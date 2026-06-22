import { createHmac, timingSafeEqual } from "node:crypto";

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

type VerificationFailureReason =
  | "missing_secret"
  | "missing_timestamp"
  | "invalid_timestamp"
  | "missing_signature"
  | "invalid_signature";

export type YCloudWebhookVerification =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: VerificationFailureReason };

interface VerifyYCloudWebhookInput {
  headers: Headers;
  rawBody: Uint8Array;
  secret?: string;
  nowMs?: number;
}

function firstHeader(headers: Headers, names: string[]) {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value) return value;
  }

  return "";
}

function signatureCandidates(value: string) {
  return value
    .split(/[\s,]+/)
    .map((candidate) => candidate.trim())
    .filter(Boolean)
    .map((candidate) => candidate.replace(/^v\d+=?/i, "").replace(/^sha256=/i, ""))
    .filter(Boolean);
}

function ycloudSignatureParts(value: string) {
  const parts = value.split(",").reduce<Record<string, string>>((result, part) => {
    const separator = part.indexOf("=");
    if (separator < 1) return result;

    const key = part.slice(0, separator).trim().toLowerCase();
    const value = part.slice(separator + 1).trim();
    return key && value ? { ...result, [key]: value } : result;
  }, {});

  return {
    timestamp: parts.t ?? "",
    signature: parts.s ?? ""
  };
}

function safeEqual(candidate: string, expected: string) {
  const left = Buffer.from(candidate);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function secretBytes(secret: string) {
  if (!secret.startsWith("whsec_")) return Buffer.from(secret, "utf8");

  const encoded = secret.slice("whsec_".length);
  const decoded = Buffer.from(encoded, "base64");
  return decoded.length > 0 ? decoded : Buffer.from(secret, "utf8");
}

function timestampMilliseconds(timestamp: string) {
  if (!/^\d+$/.test(timestamp)) return Number.NaN;

  const numericTimestamp = Number(timestamp);
  if (!Number.isSafeInteger(numericTimestamp)) return Number.NaN;
  return numericTimestamp >= 1_000_000_000_000 ? numericTimestamp : numericTimestamp * 1000;
}

function digest(
  secret: Uint8Array,
  prefix: string,
  rawBody: Uint8Array,
  encoding: "hex" | "base64"
) {
  return createHmac("sha256", secret).update(prefix).update(rawBody).digest(encoding);
}

export function verifyYCloudWebhook({
  headers,
  rawBody,
  secret,
  nowMs = Date.now()
}: VerifyYCloudWebhookInput): YCloudWebhookVerification {
  const configuredSecret = secret?.trim();
  if (!configuredSecret) {
    return { ok: false, status: 503, reason: "missing_secret" };
  }

  const timestamp = firstHeader(headers, [
    "webhook-timestamp",
    "svix-timestamp",
    "x-webhook-timestamp",
    "x-ycloud-timestamp",
    "x-yc-timestamp",
    "x-signature-timestamp"
  ]);
  const standardSignature = firstHeader(headers, [
    "webhook-signature",
    "svix-signature",
    "x-webhook-signature"
  ]);
  const ycloudSignature = firstHeader(headers, ["ycloud-signature"]);
  const rawSignature = firstHeader(headers, [
    "x-yc-signature",
    "x-ycloud-signature",
    "x-signature-256",
    "x-hub-signature-256",
    "x-signature"
  ]);

  if (!standardSignature && !rawSignature) {
    if (!ycloudSignature) {
      return { ok: false, status: 401, reason: "missing_signature" };
    }
  }

  if (ycloudSignature) {
    const official = ycloudSignatureParts(ycloudSignature);
    if (official.timestamp || official.signature) {
      if (!official.timestamp) {
        return { ok: false, status: 401, reason: "missing_timestamp" };
      }
      if (!official.signature) {
        return { ok: false, status: 401, reason: "missing_signature" };
      }

      const timestampMs = timestampMilliseconds(official.timestamp);
      if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > MAX_TIMESTAMP_AGE_MS) {
        return { ok: false, status: 401, reason: "invalid_timestamp" };
      }

      const expected = digest(
        Buffer.from(configuredSecret, "utf8"),
        `${official.timestamp}.`,
        rawBody,
        "hex"
      );
      return safeEqual(official.signature.toLowerCase(), expected)
        ? { ok: true }
        : { ok: false, status: 401, reason: "invalid_signature" };
    }
  }

  if (timestamp) {
    const timestampMs = timestampMilliseconds(timestamp);
    if (!Number.isFinite(timestampMs) || Math.abs(nowMs - timestampMs) > MAX_TIMESTAMP_AGE_MS) {
      return { ok: false, status: 401, reason: "invalid_timestamp" };
    }
  }

  const key = secretBytes(configuredSecret);
  const webhookId = firstHeader(headers, ["webhook-id", "svix-id", "x-webhook-id"]);

  if (standardSignature && !timestamp && !rawSignature) {
    return { ok: false, status: 401, reason: "missing_timestamp" };
  }

  if (standardSignature && webhookId && timestamp) {
    const expected = digest(key, `${webhookId}.${timestamp}.`, rawBody, "base64");
    if (signatureCandidates(standardSignature).some((candidate) => safeEqual(candidate, expected))) {
      return { ok: true };
    }
  }

  const legacyRawSignature = rawSignature || ycloudSignature;
  if (legacyRawSignature) {
    const prefix = timestamp ? `${timestamp}.` : "";
    const expectedHex = digest(key, prefix, rawBody, "hex");
    const expectedBase64 = digest(key, prefix, rawBody, "base64");
    const matches = signatureCandidates(legacyRawSignature).some(
      (candidate) => safeEqual(candidate.toLowerCase(), expectedHex) || safeEqual(candidate, expectedBase64)
    );
    if (matches) return { ok: true };
  }

  return { ok: false, status: 401, reason: "invalid_signature" };
}
