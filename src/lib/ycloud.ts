type YCloudSendStatus =
  | { sent: true; providerMessageId?: string; response?: Record<string, unknown> }
  | {
      sent: false;
      reason: "missing_ycloud_config" | "missing_phone" | "ycloud_error";
      detail?: string;
      response?: Record<string, unknown>;
    };

function normalizeYCloudPhone(value?: string) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function getNestedRecord(source: Record<string, unknown>, key: string) {
  return asRecord(source[key]) ?? {};
}

function getString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  return "";
}

function extractYCloudMessageId(payload?: Record<string, unknown>) {
  if (!payload) return undefined;

  const data = getNestedRecord(payload, "data");
  const message = getNestedRecord(payload, "message");
  const dataMessage = getNestedRecord(data, "message");
  const whatsappMessage = getNestedRecord(payload, "whatsappMessage");

  return (
    getString(payload, ["id", "messageId", "message_id", "wamid"]) ||
    getString(data, ["id", "messageId", "message_id", "wamid"]) ||
    getString(message, ["id", "messageId", "message_id", "wamid"]) ||
    getString(dataMessage, ["id", "messageId", "message_id", "wamid"]) ||
    getString(whatsappMessage, ["id", "messageId", "message_id", "wamid"]) ||
    undefined
  );
}

export async function sendYCloudTextMessage(phone: string | undefined, message: string): Promise<YCloudSendStatus> {
  const apiKey = process.env.YCLOUD_API_KEY;
  const from = normalizeYCloudPhone(process.env.YCLOUD_WHATSAPP_FROM || "59178096231");
  const to = normalizeYCloudPhone(phone);

  if (!apiKey || !from) {
    return { sent: false, reason: "missing_ycloud_config" };
  }

  if (!to) {
    return { sent: false, reason: "missing_phone" };
  }

  const response = await fetch("https://api.ycloud.com/v2/whatsapp/messages/sendDirectly", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey
    },
    body: JSON.stringify({
      from,
      to,
      type: "text",
      text: { body: message }
    })
  });

  const payload = asRecord(await response.json().catch(() => null)) ?? undefined;

  if (!response.ok) {
    return {
      sent: false,
      reason: "ycloud_error",
      detail: JSON.stringify(payload ?? {}).slice(0, 240) || response.statusText,
      response: payload
    };
  }

  return {
    sent: true,
    providerMessageId: extractYCloudMessageId(payload),
    response: payload
  };
}

export function manualSendError(status: YCloudSendStatus) {
  if (status.sent) return { statusCode: 200, message: "" };

  if (status.reason === "missing_ycloud_config") {
    return {
      statusCode: 503,
      message: "YCloud no esta configurado en produccion."
    };
  }

  if (status.reason === "missing_phone") {
    return {
      statusCode: 400,
      message: "Este chat no tiene un numero de WhatsApp valido."
    };
  }

  return {
    statusCode: 502,
    message: status.detail
      ? `YCloud rechazo el mensaje: ${status.detail}`
      : "YCloud rechazo el mensaje."
  };
}
