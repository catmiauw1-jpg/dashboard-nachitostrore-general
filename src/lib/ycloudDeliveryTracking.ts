export interface YCloudDeliveryResult {
  sent: boolean;
  providerMessageId?: string;
  reason?: string;
  detail?: string;
}

export interface DeliveryTrackingUpdate {
  messageId: string;
  providerMessageId?: string;
  status: "accepted" | "failed";
  error?: string;
}

export function buildDeliveryTrackingUpdate(
  messageId: string | undefined,
  delivery: YCloudDeliveryResult
): DeliveryTrackingUpdate | null {
  const normalizedMessageId = messageId?.trim();
  if (!normalizedMessageId) return null;

  return {
    messageId: normalizedMessageId,
    providerMessageId: delivery.sent ? delivery.providerMessageId : undefined,
    status: delivery.sent ? "accepted" : "failed",
    error: delivery.sent ? undefined : delivery.detail || delivery.reason || "ycloud_error"
  };
}
