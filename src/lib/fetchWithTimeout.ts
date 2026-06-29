const DEFAULT_TIMEOUT_MS = 3_000;

export function getWhatsappAiTimeoutMs() {
  const configured = Number(process.env.WHATSAPP_AI_TIMEOUT_MS);
  if (!Number.isFinite(configured)) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.max(Math.trunc(configured), 500), 10_000);
}

export async function fetchWithTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs = DEFAULT_TIMEOUT_MS
) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException("AI request timed out", "TimeoutError"));
  }, timeoutMs);

  try {
    return await request(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}
