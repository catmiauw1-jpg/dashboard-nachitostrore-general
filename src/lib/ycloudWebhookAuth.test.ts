import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { verifyYCloudWebhook } from "./ycloudWebhookAuth.ts";

const secret = "test-webhook-secret";
const nowMs = Date.UTC(2026, 5, 19, 12, 0, 0);
const timestamp = String(Math.floor(nowMs / 1000));
const rawBody = Buffer.from('{"message":"á","spacing": true}', "utf8");

function rawSignature(body = rawBody, requestTimestamp = timestamp) {
  return createHmac("sha256", secret)
    .update(`${requestTimestamp}.`)
    .update(body)
    .digest("hex");
}

function bodyOnlySignature(body = rawBody) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

test("fails closed with 503 when the YCloud secret is missing", () => {
  const result = verifyYCloudWebhook({
    headers: new Headers(),
    rawBody,
    secret: undefined,
    nowMs
  });

  assert.deepEqual(result, { ok: false, status: 503, reason: "missing_secret" });
});

test("accepts a valid raw-body HMAC bound to a fresh timestamp", () => {
  const headers = new Headers({
    "x-ycloud-timestamp": timestamp,
    "x-ycloud-signature": `sha256=${rawSignature()}`
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), { ok: true });
});

test("accepts YCloud's raw-body HMAC when its request has no timestamp header", () => {
  const headers = new Headers({
    "x-ycloud-signature": `sha256=${bodyOnlySignature()}`
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), { ok: true });
});

test("accepts the ycloud-signature header used by YCloud production webhooks", () => {
  const headers = new Headers({
    "ycloud-signature": `sha256=${bodyOnlySignature()}`
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), { ok: true });
});

test("accepts YCloud's official t,s signature with the webhook secret verbatim", () => {
  const ycloudSecret = "whsec_not-base64-secret";
  const signature = createHmac("sha256", ycloudSecret)
    .update(`${timestamp}.`)
    .update(rawBody)
    .digest("hex");
  const headers = new Headers({
    "ycloud-signature": `t=${timestamp},s=${signature}`,
    "x-webhook-endpoint-id": "endpoint_test"
  });

  assert.deepEqual(
    verifyYCloudWebhook({ headers, rawBody, secret: ycloudSecret, nowMs }),
    { ok: true }
  );
});

test("rejects a stale timestamp embedded in YCloud's t,s signature", () => {
  const staleTimestamp = String(Math.floor((nowMs - 300_001) / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${staleTimestamp}.`)
    .update(rawBody)
    .digest("hex");
  const headers = new Headers({
    "ycloud-signature": `t=${staleTimestamp},s=${signature}`
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), {
    ok: false,
    status: 401,
    reason: "invalid_timestamp"
  });
});

test("rejects an invalid raw-body HMAC when its request has no timestamp header", () => {
  const headers = new Headers({
    "x-ycloud-signature": "sha256=invalid"
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), {
    ok: false,
    status: 401,
    reason: "invalid_signature"
  });
});

test("reports a missing signature before requiring a timestamp", () => {
  assert.deepEqual(
    verifyYCloudWebhook({ headers: new Headers(), rawBody, secret, nowMs }),
    { ok: false, status: 401, reason: "missing_signature" }
  );
});

test("still requires a timestamp for the standard webhook signature format", () => {
  const headers = new Headers({
    "webhook-id": "msg_test",
    "webhook-signature": "v1,invalid"
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), {
    ok: false,
    status: 401,
    reason: "missing_timestamp"
  });
});

test("rejects a signature computed from reserialized JSON", () => {
  const reserialized = Buffer.from(JSON.stringify(JSON.parse(rawBody.toString("utf8"))), "utf8");
  const headers = new Headers({
    "x-ycloud-timestamp": timestamp,
    "x-ycloud-signature": rawSignature(reserialized)
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), {
    ok: false,
    status: 401,
    reason: "invalid_signature"
  });
});

test("rejects timestamps older than five minutes", () => {
  const staleTimestamp = String(Math.floor((nowMs - 300_001) / 1000));
  const headers = new Headers({
    "x-ycloud-timestamp": staleTimestamp,
    "x-ycloud-signature": rawSignature(rawBody, staleTimestamp)
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), {
    ok: false,
    status: 401,
    reason: "invalid_timestamp"
  });
});

test("rejects timestamps more than five minutes in the future", () => {
  const futureTimestamp = String(Math.floor((nowMs + 301_000) / 1000));
  const headers = new Headers({
    "x-ycloud-timestamp": futureTimestamp,
    "x-ycloud-signature": rawSignature(rawBody, futureTimestamp)
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), {
    ok: false,
    status: 401,
    reason: "invalid_timestamp"
  });
});

test("accepts the standard webhook id.timestamp.raw base64 format", () => {
  const webhookId = "msg_test";
  const encodedSecret = `whsec_${Buffer.from(secret).toString("base64")}`;
  const signature = createHmac("sha256", secret)
    .update(`${webhookId}.${timestamp}.`)
    .update(rawBody)
    .digest("base64");
  const headers = new Headers({
    "webhook-id": webhookId,
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${signature}`
  });

  assert.deepEqual(
    verifyYCloudWebhook({ headers, rawBody, secret: encodedSecret, nowMs }),
    { ok: true }
  );
});

test("does not accept bearer or internal shared secrets", () => {
  const headers = new Headers({
    authorization: `Bearer ${secret}`,
    "x-poleraflow-webhook-secret": secret,
    "x-ycloud-timestamp": timestamp
  });

  assert.deepEqual(verifyYCloudWebhook({ headers, rawBody, secret, nowMs }), {
    ok: false,
    status: 401,
    reason: "missing_signature"
  });
});
