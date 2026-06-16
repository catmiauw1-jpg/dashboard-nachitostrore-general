"use client";

import {
  IconBrandWhatsapp,
  IconCheck,
  IconCopy,
  IconFilter,
  IconMessageCircle,
  IconQrcode,
  IconSend,
  IconShieldCheck,
  IconSparkles
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { badgeClass, formatCurrency } from "@/lib/format";
import type { Conversation, ConversationMessage, Order, OrderStatus, PaymentStatus } from "@/types";

interface WhatsAppSalesSectionProps {
  chats: Conversation[];
  focusedPhone?: string;
  orders: Order[];
  onToggleBot: (index: number) => void;
  onUpdateOrder: (orderId: string, updates: Partial<Order>) => void;
  onSendManualMessage: (chat: Conversation, message: string) => Promise<void>;
}

const mercantilQrUrl = "/payment/mercantil-qr.jpeg";

function formatDate(value?: string) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return new Intl.DateTimeFormat("es-BO", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function formatMessageTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("es-BO", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function isImageAttachment(url?: string, type?: string) {
  const normalizedType = (type ?? "").toLowerCase();
  const normalizedUrl = (url ?? "").toLowerCase();
  return (
    normalizedType.includes("image") ||
    /\.(apng|avif|gif|jpe?g|png|webp)(\?|#|$)/i.test(normalizedUrl)
  );
}

function visibleMessageBody(body: string, hasAttachment: boolean) {
  if (!hasAttachment) return body;
  const normalized = body.trim().toLowerCase();
  return normalized === "[image]" || normalized === "[document]" || normalized === "[archivo]" ? "" : body;
}

function deliveryLabel(message: ConversationMessage) {
  if (message.direction !== "outbound") return "";

  const labels: Record<string, string> = {
    local: "local",
    accepted: "pendiente",
    sent: "enviado",
    delivered: "entregado",
    read: "leido",
    failed: "fallo"
  };

  return labels[message.deliveryStatus ?? ""] ?? "";
}

function normalizePhone(value?: string) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (!digits) return "";
  if (digits.startsWith("591")) return digits;
  if (digits.length === 8) return `591${digits}`;
  return digits;
}

function shortPhone(value?: string) {
  const phone = normalizePhone(value);
  return phone.startsWith("591") ? phone.slice(3) : phone;
}

function chatSortTime(chat: Conversation) {
  const time = new Date(chat.lastMessageAt ?? "").getTime();
  return Number.isNaN(time) ? 0 : time;
}

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "WA"
  );
}

function conversationKey(chat?: Conversation) {
  return chat?.id ?? chat?.phone ?? "";
}

function orderCode(order: Order) {
  const digits = order.id.replace(/\D/g, "").slice(-6);
  return digits ? `PED-${digits.padStart(6, "0")}` : order.id.replace(/^#/, "");
}

function hasProof(order: Order) {
  return Boolean(order.paymentProofUrls?.length || order.referenceImages?.some((reference) => /comprobante|proof|pago/i.test(reference)));
}

function stateLabel(order: Order) {
  if (hasProof(order) || order.requiresManualReview) return "Revisar pago";
  if (order.payment !== "Pago completo") return "Pago pendiente";
  if (order.status === "En preparación") return "En preparación";
  if (order.status === "Lista para enviar") return "Listo";
  if (order.status === "Entregado") return "Entregado";
  if (order.status === "Cancelado") return "Cancelado";
  return order.status;
}

function paymentInstructions(order: Order) {
  return [
    `Pedido: ${orderCode(order)}`,
    `Monto exacto: ${formatCurrency(order.paymentAmountDue ?? order.total)}`,
    "Concepto: NachitoStore",
    "Envia tu comprobante cuando termines el pago."
  ].join("\n");
}

function confirmationMessage(order: Order) {
  return [
    "Pago confirmado.",
    "Tu pedido entra a produccion.",
    `Pedido: ${orderCode(order)}`
  ].join("\n");
}

function readySantaCruzTemplate() {
  return [
    "Tu pedido esta listo.",
    "Podemos enviarlo por Yango o puedes pasar a recogerlo.",
    "Confirmame tu direccion completa para coordinar."
  ].join("\n");
}

function readyFlotaTemplate() {
  return [
    "Tu pedido esta listo.",
    "Sale por flota el proximo jueves/viernes.",
    "Confirmame nombre, ciudad y direccion exacta."
  ].join("\n");
}

function proofRequestTemplate(order?: Order) {
  return [
    "Tu pedido sigue esperando comprobante.",
    `Monto: ${formatCurrency(order?.paymentAmountDue ?? order?.total ?? 0)}`,
    "Cuando pagues, envia foto o PDF por aqui."
  ].join("\n");
}

function conversationBadges(chat: Conversation) {
  const status = `${chat.status} ${chat.stage ?? ""}`.toLowerCase();
  const badges: Array<{ label: string; tone: string }> = [];

  if (chat.alert || !chat.bot) badges.push({ label: "Atencion", tone: "warning" });
  if (status.includes("comprobante") || status.includes("pago") || status.includes("falta")) {
    badges.push({ label: "Pago pendiente", tone: "danger" });
  }
  if (chat.bot) badges.push({ label: "Bot", tone: "success" });
  if (status.includes("nuevo")) badges.push({ label: "Nuevo", tone: "info" });

  return badges.slice(0, 3);
}

function isSameClient(order: Order, chat?: Conversation) {
  if (!chat) return false;
  const chatPhone = normalizePhone(chat.phone);
  const orderPhone = normalizePhone(order.customerPhone);
  if (chatPhone && orderPhone && chatPhone === orderPhone) return true;

  const chatShort = shortPhone(chat.phone);
  const orderShort = shortPhone(order.customerPhone);
  if (chatShort && orderShort && chatShort === orderShort) return true;

  return order.customer.trim().toLowerCase() === chat.name.trim().toLowerCase();
}

export function WhatsAppSalesSection({
  chats,
  focusedPhone,
  orders,
  onToggleBot,
  onUpdateOrder,
  onSendManualMessage
}: WhatsAppSalesSectionProps) {
  const [selectedChatKey, setSelectedChatKey] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState("");
  const [draftMessage, setDraftMessage] = useState("");
  const [chatQuery, setChatQuery] = useState("");
  const [isSending, setIsSending] = useState(false);
  const messageThreadRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const previousThreadRef = useRef({ chatKey: "", messageCount: 0 });

  const activeOrders = useMemo(
    () => orders.filter((order) => order.status !== "Cancelado" && order.status !== "Entregado"),
    [orders]
  );

  const reviewOrders = useMemo(
    () =>
      activeOrders.filter(
        (order) =>
          order.payment !== "Pago completo" ||
          order.requiresManualReview ||
          hasProof(order) ||
          order.paymentAmountDue ||
          order.paymentChoice
      ),
    [activeOrders]
  );

  const sortedChats = useMemo(
    () => [...chats].sort((left, right) => chatSortTime(right) - chatSortTime(left)),
    [chats]
  );

  const filteredChats = useMemo(() => {
    const normalizedQuery = chatQuery.trim().toLowerCase();
    if (!normalizedQuery) return sortedChats;

    return sortedChats.filter((chat) =>
      [chat.name, chat.phone, chat.status, chat.lastMessage]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [chatQuery, sortedChats]);

  const selectedChat =
    sortedChats.find((chat) => conversationKey(chat) === selectedChatKey) ?? filteredChats[0] ?? sortedChats[0];

  const selectedChatIndex = selectedChat
    ? chats.findIndex((chat) => conversationKey(chat) === conversationKey(selectedChat))
    : -1;

  const chatPaymentOrders = useMemo(() => {
    if (!selectedChat) return [];
    return reviewOrders
      .filter((order) => isSameClient(order, selectedChat))
      .sort((left, right) => new Date(right.createdAt ?? 0).getTime() - new Date(left.createdAt ?? 0).getTime());
  }, [reviewOrders, selectedChat]);

  const selectedOrder =
    (selectedOrderId ? chatPaymentOrders.find((order) => order.id === selectedOrderId) : null) ??
    chatPaymentOrders[0] ??
    null;

  const manualChats = sortedChats.filter((chat) => !chat.bot || chat.alert);
  const proofOrders = reviewOrders.filter((order) => hasProof(order) || order.requiresManualReview);
  const waitingProofOrders = reviewOrders.filter((order) => order.payment !== "Pago completo" && !hasProof(order));

  const templates = [
    ["Listo Santa Cruz", readySantaCruzTemplate()],
    ["Listo flota", readyFlotaTemplate()],
    ["Pedir comprobante", proofRequestTemplate(selectedOrder ?? undefined)],
    ["Pago confirmado", selectedOrder ? confirmationMessage(selectedOrder) : ""]
  ] as const;

  useEffect(() => {
    if (!selectedChatKey && sortedChats[0]) {
      setSelectedChatKey(conversationKey(sortedChats[0]));
    }
  }, [selectedChatKey, sortedChats]);

  useEffect(() => {
    const targetPhone = normalizePhone(focusedPhone);
    const targetShortPhone = shortPhone(focusedPhone);
    if (!targetPhone && !targetShortPhone) return;

    const targetChat = sortedChats.find((chat) => {
      const chatPhone = normalizePhone(chat.phone);
      const chatShortPhone = shortPhone(chat.phone);
      return (
        (targetPhone && chatPhone === targetPhone) ||
        (targetShortPhone && chatShortPhone === targetShortPhone)
      );
    });

    if (targetChat) {
      setSelectedChatKey(conversationKey(targetChat));
      setChatQuery("");
    }
  }, [focusedPhone, sortedChats]);

  useEffect(() => {
    setSelectedOrderId(chatPaymentOrders[0]?.id ?? null);
  }, [chatPaymentOrders, selectedChatKey]);

  useEffect(() => {
    const thread = messageThreadRef.current;
    if (!thread) return;

    const messageCount = selectedChat?.messages?.length ?? 0;
    const previousThread = previousThreadRef.current;
    const chatChanged = previousThread.chatKey !== selectedChatKey;
    const hasNewMessage = messageCount > previousThread.messageCount;

    if (chatChanged || (hasNewMessage && shouldAutoScrollRef.current)) {
      thread.scrollTop = thread.scrollHeight;
      shouldAutoScrollRef.current = true;
    }

    previousThreadRef.current = { chatKey: selectedChatKey, messageCount };
  }, [selectedChat?.messages?.length, selectedChatKey]);

  const handleThreadScroll = () => {
    const thread = messageThreadRef.current;
    if (!thread) return;

    const distanceFromBottom = thread.scrollHeight - thread.scrollTop - thread.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 120;
  };

  const copyText = async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(label);
    window.setTimeout(() => setCopiedText(""), 1800);
  };

  const openWhatsApp = (chat?: Conversation) => {
    const phone = normalizePhone(chat?.phone);
    if (!phone) return;
    window.open(`https://wa.me/${phone}`, "_blank", "noopener,noreferrer");
  };

  const sendManualMessage = async () => {
    if (!selectedChat || !draftMessage.trim()) return;
    setIsSending(true);
    shouldAutoScrollRef.current = true;

    try {
      await onSendManualMessage(selectedChat, draftMessage);
      setDraftMessage("");
    } finally {
      setIsSending(false);
    }
  };

  const confirmPayment = (order: Order) => {
    onUpdateOrder(order.id, {
      payment: "Pago completo" as PaymentStatus,
      status: "En preparación" as OrderStatus,
      botStatus: "Atención manual",
      requiresManualReview: false,
      notes: [order.notes, `Pago confirmado desde WhatsApp panel: ${new Date().toISOString()}`].filter(Boolean).join("\n")
    });
  };

  return (
    <section className="section-workspace whatsapp-sales-workspace whatsapp-console-workspace">
      <header className="whatsapp-console-head">
        <div>
          <span className="section-kicker">WhatsApp comercial</span>
          <h2>Centro de control WhatsApp</h2>
          <p>Revisa pagos, atiende conversaciones y usa plantillas listas mientras el bot opera con QR Mercantil.</p>
        </div>
        <a className="btn primary" href="https://wa.me/59178096231" rel="noreferrer" target="_blank">
          <IconBrandWhatsapp size={17} /> Abrir WhatsApp
        </a>
      </header>

      <div className="whatsapp-console-stats">
        <article>
          <span><IconShieldCheck size={15} /> Pagos por verificar</span>
          <strong>{proofOrders.length}</strong>
          <small>Comprobantes recibidos o revision manual</small>
        </article>
        <article>
          <span><IconQrcode size={15} /> Esperando comprobante</span>
          <strong>{waitingProofOrders.length}</strong>
          <small>Ya recibieron monto y QR</small>
        </article>
        <article>
          <span><IconMessageCircle size={15} /> Chats manuales</span>
          <strong>{manualChats.length}</strong>
          <small>Necesitan respuesta humana</small>
        </article>
        <article>
          <span><IconSparkles size={15} /> Gemini + Gmail</span>
          <strong>Activo</strong>
          <small>Lee comprobante y compara con correo Mercantil</small>
        </article>
      </div>

      <div className="whatsapp-console-grid">
        <aside className="whatsapp-console-sidebar">
          <div className="whatsapp-console-title">
            <h3>Conversaciones</h3>
            <button aria-label="Filtrar conversaciones" className="btn icon" type="button">
              <IconFilter size={16} />
            </button>
          </div>

          <input
            className="search whatsapp-console-search"
            onChange={(event) => setChatQuery(event.target.value)}
            placeholder="Buscar cliente o telefono..."
            type="search"
            value={chatQuery}
          />

          <div className="whatsapp-console-list">
            {filteredChats.map((chat) => {
              const isActive = conversationKey(chat) === conversationKey(selectedChat);
              const badges = conversationBadges(chat);

              return (
                <button
                  className={`whatsapp-console-chat ${isActive ? "active" : ""}`}
                  key={conversationKey(chat)}
                  onClick={() => setSelectedChatKey(conversationKey(chat))}
                  type="button"
                >
                  <span className="bot-avatar">{initials(chat.name)}</span>
                  <span className="whatsapp-console-chat-copy">
                    <span>
                      <strong>{chat.name}</strong>
                      <small>{formatMessageTime(chat.lastMessageAt) || "ayer"}</small>
                    </span>
                    <p>{chat.lastMessage || chat.status || "Sin mensajes todavia"}</p>
                    <span className="whatsapp-badge-row">
                      {badges.map((badge) => (
                        <span className={`badge ${badge.tone}`} key={badge.label}>{badge.label}</span>
                      ))}
                    </span>
                  </span>
                </button>
              );
            })}

            {!filteredChats.length ? (
              <div className="empty-state compact-empty">
                <strong>Sin conversaciones</strong>
                <p>Cuando llegue un mensaje por WhatsApp aparecera aqui.</p>
              </div>
            ) : null}
          </div>
        </aside>

        <main className="whatsapp-console-chat-panel">
          {selectedChat ? (
            <>
              <div className="whatsapp-console-chat-head">
                <span className="bot-avatar">{initials(selectedChat.name)}</span>
                <div>
                  <h3>{selectedChat.name}</h3>
                  <p>{selectedChat.phone} · {selectedChat.status}</p>
                </div>
                <span className={`badge ${selectedChat.bot ? "success" : "warning"}`}>
                  {selectedChat.bot ? "Bot on" : "Manual"}
                </span>
                <button className="btn" disabled={selectedChatIndex < 0} onClick={() => onToggleBot(selectedChatIndex)} type="button">
                  {selectedChat.bot ? "Pausar bot" : "Activar bot"}
                </button>
                <button className="btn primary" onClick={() => openWhatsApp(selectedChat)} type="button">
                  <IconBrandWhatsapp size={16} /> Abrir WhatsApp
                </button>
              </div>

              <div className="whatsapp-console-thread" onScroll={handleThreadScroll} ref={messageThreadRef}>
                {(selectedChat.messages ?? []).map((message) => (
                  <article
                    className={`wa-message ${message.direction === "outbound" ? "out" : "in"}`}
                    key={message.id ?? `${message.createdAt}-${message.body}`}
                  >
                    {message.attachmentUrl && isImageAttachment(message.attachmentUrl, message.attachmentType) ? (
                      <a className="wa-message-media" href={message.attachmentUrl} rel="noreferrer" target="_blank">
                        <img alt="Adjunto de WhatsApp" src={message.attachmentUrl} />
                      </a>
                    ) : null}
                    {message.attachmentUrl && !isImageAttachment(message.attachmentUrl, message.attachmentType) ? (
                      <a className="wa-message-file" href={message.attachmentUrl} rel="noreferrer" target="_blank">
                        Ver archivo adjunto
                      </a>
                    ) : null}
                    {visibleMessageBody(message.body, Boolean(message.attachmentUrl)) ? (
                      <p>{visibleMessageBody(message.body, Boolean(message.attachmentUrl))}</p>
                    ) : null}
                    <small>
                      {formatMessageTime(message.createdAt)}
                      {deliveryLabel(message) ? ` · ${deliveryLabel(message)}` : ""}
                    </small>
                  </article>
                ))}

                {!(selectedChat.messages ?? []).length ? (
                  <div className="empty-state compact-empty">
                    <strong>Sin historial cargado</strong>
                    <p>Los mensajes nuevos apareceran aqui cuando entren por YCloud.</p>
                  </div>
                ) : null}
              </div>

              <div className="whatsapp-console-composer">
                <div className="whatsapp-console-templates">
                  <span>Plantillas:</span>
                  {templates.map(([label, text]) => (
                    <button className="template-pill" key={label} onClick={() => setDraftMessage(text)} type="button">
                      {label}{label === "Pago confirmado" ? " ✅" : ""}
                    </button>
                  ))}
                </div>
                <div className="whatsapp-console-input-row">
                  <textarea
                    onChange={(event) => setDraftMessage(event.target.value)}
                    placeholder="Escribe o elige una plantilla..."
                    value={draftMessage}
                  />
                  <button className="btn primary" disabled={!draftMessage.trim() || isSending} onClick={() => void sendManualMessage()} type="button">
                    <IconSend size={15} /> {isSending ? "Enviando" : "Enviar"}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state order-detail-empty">
              <strong>Selecciona un chat</strong>
              <p>El historial y las plantillas apareceran aqui.</p>
            </div>
          )}
        </main>

        <aside className="whatsapp-console-payment">
          <div className="whatsapp-console-title">
            <h3>Revision de pago</h3>
            <small>{selectedChat ? "Del chat seleccionado" : "Selecciona un chat"}</small>
          </div>

          <div className="whatsapp-payment-stack compact-review-list">
            {chatPaymentOrders.map((order) => (
              <button
                className={`payment-order-card compact-payment-card ${selectedOrder?.id === order.id ? "active" : ""}`}
                key={order.id}
                onClick={() => setSelectedOrderId(order.id)}
                type="button"
              >
                <span>
                  <strong>{orderCode(order)}</strong>
                  <small>{order.customer}</small>
                </span>
                <span className={`badge ${badgeClass(stateLabel(order))}`}>{stateLabel(order)}</span>
                <span>{order.paymentChoice === "50%" ? "50%" : order.payment}</span>
                <strong>{formatCurrency(order.paymentAmountDue ?? order.total)}</strong>
              </button>
            ))}
          </div>

          {selectedOrder ? (
            <div className="whatsapp-payment-detail compact-payment-detail">
              <div className="payment-detail-grid">
                <div>
                  <span>Monto</span>
                  <strong>{formatCurrency(selectedOrder.paymentAmountDue ?? selectedOrder.total)}</strong>
                </div>
                <div>
                  <span>Tipo de pago</span>
                  <strong>{selectedOrder.paymentChoice === "50%" ? "50%" : selectedOrder.payment}</strong>
                </div>
                <div>
                  <span>Estado</span>
                  <strong>{stateLabel(selectedOrder)}</strong>
                </div>
                <div>
                  <span>Fecha</span>
                  <strong>{formatDate(selectedOrder.createdAt)}</strong>
                </div>
              </div>

              <div className="order-detail-block">
                <div className="order-detail-title">
                  <h4>Prendas · {selectedOrder.prendas} {selectedOrder.prendas === 1 ? "prenda" : "prendas"}</h4>
                </div>
                <div className="order-line-list">
                  {(selectedOrder.items?.length ? selectedOrder.items : [{
                    productName: selectedOrder.product,
                    color: selectedOrder.color,
                    size: selectedOrder.size,
                    quantity: selectedOrder.prendas,
                    unitPrice: selectedOrder.total / Math.max(1, selectedOrder.prendas),
                    lineTotal: selectedOrder.total
                  }]).map((item, index) => (
                    <article className="order-line-item" key={`${selectedOrder.id}-${item.productName}-${index}`}>
                      <div>
                        <strong>{item.productName}</strong>
                        <p>{item.color ?? "Color por confirmar"} · Talla {item.size ?? "por confirmar"}</p>
                      </div>
                      <div className="order-line-numbers">
                        <span>{item.quantity}x {formatCurrency(item.unitPrice)}</span>
                        <strong>{formatCurrency(item.lineTotal)}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="order-detail-block">
                <div className="order-detail-title">
                  <h4>Datos para cobrar</h4>
                </div>
                <pre className="whatsapp-message-preview">{paymentInstructions(selectedOrder)}</pre>
              </div>

              <div className="qr-mini-box">
                <img alt="QR Banco Mercantil Santa Cruz" src={mercantilQrUrl} />
                <span>QR Mercantil</span>
              </div>

              <button className="btn full-width-btn" onClick={() => void copyText(paymentInstructions(selectedOrder), "pago")} type="button">
                <IconCopy size={15} /> {copiedText === "pago" ? "Copiado" : "Copiar datos de cobro"}
              </button>
              <button className="btn primary full-width-btn" onClick={() => confirmPayment(selectedOrder)} type="button">
                <IconCheck size={16} /> Confirmar pago
              </button>
            </div>
          ) : (
            <div className="empty-state compact-empty no-payment-state">
              <strong>Sin pago para este chat</strong>
              <p>Cuando este cliente tenga un pedido pendiente, aparecera aqui automaticamente.</p>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
