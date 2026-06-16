import {
  createManualConversationMessage,
  getConversationSendWindow
} from "@/lib/conversationRepository";
import { sendYCloudTextMessage } from "@/lib/ycloud";
import type { Order, OrderStatus } from "@/types";

function normalizeStatus(status?: string) {
  return (status ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function statusMessage(order: Order, status?: OrderStatus) {
  const normalized = normalizeStatus(status);

  if (normalized.includes("cancel")) {
    return [
      "Entendido, tu pedido fue cancelado.",
      "Si quieres empezar de nuevo, entra a la web:",
      "https://nachitostore.vercel.app/"
    ].join("\n");
  }

  if (normalized.includes("prepar")) {
    return [
      "Pago confirmado. Tu pedido entra a produccion.",
      "Estara listo en 2 a 4 dias habiles.",
      "Te avisamos por aqui."
    ].join("\n");
  }

  if (normalized.includes("lista")) {
    const deliveryArea = normalizeStatus(order.deliveryArea);
    const isSantaCruz = deliveryArea.includes("santa cruz") || normalizeStatus(order.delivery).includes("recoger");

    return isSantaCruz
      ? [
          "Tu pedido esta listo.",
          "Podemos enviarlo por Yango o puedes pasar a recogerlo.",
          "Confirmame tu direccion completa para coordinar."
        ].join("\n")
      : [
          "Tu pedido esta listo.",
          "Sale por flota el proximo jueves o viernes.",
          "Confirmame nombre, ciudad y direccion para coordinar."
        ].join("\n");
  }

  if (normalized.includes("entregado")) {
    return "Todo listo. Gracias por comprar en Nachito Store.";
  }

  if (normalized.includes("esperando pago")) {
    return [
      "Tu pedido sigue esperando comprobante.",
      "Cuando pagues, envia foto o PDF por aqui."
    ].join("\n");
  }

  return "";
}

export async function notifyCustomerOrderStatus(order: Order, status?: OrderStatus) {
  const message = statusMessage(order, status);
  if (!message || !order.customerPhone) return;

  try {
    const sendWindow = await getConversationSendWindow({ phone: order.customerPhone });

    if (!sendWindow.allowed) {
      if (sendWindow.conversationId) {
        await createManualConversationMessage({
          id: sendWindow.conversationId,
          phone: order.customerPhone,
          body: message,
          source: "dashboard_auto",
          author: "sistema",
          deliveryStatus: "failed",
          deliveryError:
            sendWindow.reason === "whatsapp_session_expired"
              ? "Ventana de 24 horas cerrada. Requiere plantilla o envio manual."
              : "No hay mensaje entrante del cliente para abrir ventana de WhatsApp.",
          deliveryPayload: {
            blocked: true,
            reason: sendWindow.reason,
            lastInboundAt: sendWindow.lastInboundAt,
            hoursSinceLastInbound: sendWindow.hoursSinceLastInbound
          },
          touchConversation: false
        });
      }

      return;
    }

    const sendStatus = await sendYCloudTextMessage(order.customerPhone, message);

    await createManualConversationMessage({
      id: sendWindow.conversationId,
      phone: order.customerPhone,
      body: message,
      source: "dashboard_auto",
      author: "sistema",
      providerMessageId: sendStatus.sent ? sendStatus.providerMessageId : undefined,
      deliveryStatus: sendStatus.sent ? "accepted" : "failed",
      deliveryError: sendStatus.sent ? undefined : sendStatus.detail ?? sendStatus.reason,
      deliveryPayload: sendStatus.sent
        ? sendStatus.response
        : {
            reason: sendStatus.reason,
            detail: sendStatus.detail,
            response: sendStatus.response
          },
      touchConversation: sendStatus.sent
    });
  } catch (error) {
    console.warn("No se pudo notificar al cliente por cambio de pedido.", error);
  }
}
