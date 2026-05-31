import { IconBrandWhatsapp } from "@tabler/icons-react";
import type { Conversation } from "@/types";

interface WhatsAppBotPanelProps {
  chats: Conversation[];
  onOpenConversations: () => void;
  onToggleBot: (index: number) => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "WA";
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
          <h3><IconBrandWhatsapp size={17} stroke={1.7} />WhatsApp / Bot</h3>
          <p>Estado por conversacion</p>
        </div>
      </div>

      <div className="bot-list">
        {chats.map((chat, index) => (
          <button className="bot-item" key={chat.phone} onClick={() => onToggleBot(index)} type="button">
            <span className="bot-avatar">{initials(chat.name)}</span>
            <span className="bot-copy">
              <strong>{chat.name}</strong>
              <small>{chat.phone}</small>
            </span>
            <span className={`bot-tag ${chat.alert ? "tag-warn" : chat.bot ? "tag-on" : "tag-off"}`}>
              {chat.alert ? "Requiere atencion" : chat.bot ? "Bot on" : "Bot off"}
            </span>
          </button>
        ))}
      </div>

      <div className="card-footer">
        <button className="link-btn" onClick={onOpenConversations} type="button">
          Abrir centro de conversaciones -&gt;
        </button>
      </div>
    </article>
  );
}
