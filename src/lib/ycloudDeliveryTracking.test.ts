import assert from "node:assert/strict";
import test from "node:test";
import { buildDeliveryTrackingUpdate } from "./ycloudDeliveryTracking.ts";

test("links an accepted YCloud delivery to the matching stored bot message", () => {
  assert.deepEqual(
    buildDeliveryTrackingUpdate("message-1", {
      sent: true,
      providerMessageId: "wamid.accepted"
    }),
    {
      messageId: "message-1",
      providerMessageId: "wamid.accepted",
      status: "accepted",
      error: undefined
    }
  );
});

test("marks the matching stored bot message as failed", () => {
  assert.deepEqual(
    buildDeliveryTrackingUpdate("message-2", {
      sent: false,
      reason: "ycloud_error",
      detail: "WhatsApp session expired"
    }),
    {
      messageId: "message-2",
      providerMessageId: undefined,
      status: "failed",
      error: "WhatsApp session expired"
    }
  );
});

test("does not create an update when the bot response has no stored message id", () => {
  assert.equal(
    buildDeliveryTrackingUpdate(undefined, {
      sent: true,
      providerMessageId: "wamid.orphan"
    }),
    null
  );
});
