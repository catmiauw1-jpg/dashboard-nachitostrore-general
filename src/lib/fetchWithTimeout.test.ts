import assert from "node:assert/strict";
import test from "node:test";

import { fetchWithTimeout } from "./fetchWithTimeout.ts";

test("fetchWithTimeout returns a response before the deadline", async () => {
  const response = await fetchWithTimeout(
    async () => new Response("ok", { status: 200 }),
    50
  );

  assert.equal(await response.text(), "ok");
});

test("fetchWithTimeout aborts a slow request", async () => {
  await assert.rejects(
    fetchWithTimeout(
      (signal) =>
        new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
      10
    ),
    (error: unknown) => error instanceof Error && error.name === "TimeoutError"
  );
});

test("fetchWithTimeout keeps the deadline while the response body is read", async () => {
  await assert.rejects(
    fetchWithTimeout(async (signal) => {
      const response = new Response(
        new ReadableStream({
          start(controller) {
            const timer = setTimeout(() => {
              controller.enqueue(new TextEncoder().encode("late"));
              controller.close();
            }, 100);
            signal.addEventListener("abort", () => {
              clearTimeout(timer);
              controller.error(signal.reason);
            }, { once: true });
          }
        })
      );
      return response.text();
    }, 10),
    (error: unknown) => error instanceof Error && error.name === "TimeoutError"
  );
});
