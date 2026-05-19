import type { Conversation } from "@/types";

interface WhatsAppBotPanelProps {
  chats: Conversation[];
  onOpenConversations: () => void;
  onToggleBot: (index: number) => void;
}

export function WhatsAppBotPanel({
  chats,
  onOpenConversations,
  onToggleBot
}: WhatsAppBotPanelProps) {
  return (
    <article className="panel">
      <div className="panel-header">
        <div>
          <h3>WhatsApp / Bot</h3>
          <p>Activa o pausa el bot en cada conversación.</p>
        </div>
        <span className="badge accent">Control manual</span>
      </div>

      <div className="chat-list">
        {chats.map((chat, index) => (
          <div className="chat-item" key={chat.phone}>
            <div>
              <h4>
                {chat.name}
                {chat.alert ? " · requiere atención" : ""}
              </h4>
              <p>{chat.status}</p>
              <p>{chat.phone}</p>
            </div>
            <button
              aria-pressed={chat.bot}
              className={`bot-toggle ${chat.bot ? "bot-on" : ""}`}
              onClick={() => onToggleBot(index)}
              title={chat.bot ? "Apagar bot" : "Activar bot"}
              type="button"
            >
              <span>{chat.bot ? "ON" : "OFF"}</span>
            </button>
          </div>
        ))}
      </div>

      <button className="btn full-width-action" onClick={onOpenConversations} type="button">
        Abrir centro de conversaciones
      </button>
    </article>
  );
}
