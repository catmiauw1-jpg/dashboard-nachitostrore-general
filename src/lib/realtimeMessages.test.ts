import assert from "node:assert/strict";
import test from "node:test";
import type { Conversation } from "../types/index.ts";
import { hasMeaningfulConversationChange, mergeRealtimeMessage } from "./realtimeMessages.ts";

const chats: Conversation[] = [
  {
    id: "conversation-1",
    name: "Ana",
    phone: "59170000000",
    bot: true,
    alert: false,
    status: "Nuevo",
    lastMessage: "Anterior",
    lastMessageAt: "2026-06-29T10:00:00.000Z",
    messages: [
      {
        id: "message-1",
        direction: "inbound",
        body: "Anterior",
        createdAt: "2026-06-29T10:00:00.000Z"
      }
    ]
  }
];

test("appends a new realtime message to its conversation", () => {
  const next = mergeRealtimeMessage(chats, {
    id: "message-2",
    conversation_id: "conversation-1",
    direction: "inbound",
    body: "Nuevo mensaje",
    source: "ycloud",
    metadata: { attachmentUrl: "https://example.com/proof.jpg", attachmentType: "image/jpeg" },
    created_at: "2026-06-29T10:01:00.000Z"
  });

  assert.notStrictEqual(next, chats);
  assert.equal(next[0].messages?.length, 2);
  assert.deepEqual(next[0].messages?.[1], {
    id: "message-2",
    direction: "inbound",
    body: "Nuevo mensaje",
    source: "ycloud",
    attachmentUrl: "https://example.com/proof.jpg",
    attachmentType: "image/jpeg",
    createdAt: "2026-06-29T10:01:00.000Z"
  });
  assert.equal(next[0].lastMessage, "Nuevo mensaje");
  assert.equal(next[0].lastMessageAt, "2026-06-29T10:01:00.000Z");
  assert.equal(chats[0].messages?.length, 1);
});

test("updates an existing message instead of duplicating it", () => {
  const next = mergeRealtimeMessage(chats, {
    id: "message-1",
    conversation_id: "conversation-1",
    direction: "inbound",
    body: "Anterior",
    source: "ycloud",
    metadata: {},
    created_at: "2026-06-29T10:00:00.000Z",
    delivery_status: "read",
    read_at: "2026-06-29T10:02:00.000Z"
  });

  assert.equal(next[0].messages?.length, 1);
  assert.equal(next[0].messages?.[0].deliveryStatus, "read");
  assert.equal(next[0].messages?.[0].readAt, "2026-06-29T10:02:00.000Z");
});

test("moves the conversation with the newest message to the top", () => {
  const next = mergeRealtimeMessage([
    {
      ...chats[0],
      id: "conversation-newer",
      lastMessageAt: "2026-06-29T10:02:00.000Z"
    },
    chats[0]
  ], {
    id: "message-2",
    conversation_id: "conversation-1",
    direction: "inbound",
    body: "Ahora soy la mas reciente",
    created_at: "2026-06-29T10:03:00.000Z"
  });

  assert.equal(next[0].id, "conversation-1");
  assert.equal(next[1].id, "conversation-newer");
});

test("does not rerender conversations unrelated to the realtime row", () => {
  const next = mergeRealtimeMessage(chats, {
    id: "message-2",
    conversation_id: "conversation-unknown",
    direction: "outbound",
    body: "Hola",
    source: "manual",
    metadata: {},
    created_at: "2026-06-29T10:01:00.000Z"
  });

  assert.strictEqual(next, chats);
});

test("ignores conversation timestamp updates caused by a new message", () => {
  const previous = {
    id: "conversation-1",
    customer_name: "Ana",
    bot_active: true,
    status: "nuevo",
    updated_at: "2026-06-29T10:00:00.000Z",
    last_message_at: "2026-06-29T10:00:00.000Z"
  };
  const next = {
    ...previous,
    updated_at: "2026-06-29T10:01:00.000Z",
    last_message_at: "2026-06-29T10:01:00.000Z"
  };

  assert.equal(hasMeaningfulConversationChange(previous, next), false);
  assert.equal(hasMeaningfulConversationChange(previous, { ...next, bot_active: false }), true);
});
