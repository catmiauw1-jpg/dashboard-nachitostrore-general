"use client";

import {
  IconBrandWhatsapp,
  IconCopy,
  IconDatabase,
  IconMailCheck,
  IconQrcode,
  IconRobot,
  IconShieldLock,
  IconWorld
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

interface ConfigurationSectionProps {
  adminEmail: string;
  onNotify: (message: string) => void;
}

const defaultSettings = {
  storeName: "Nachito Store",
  storeUrl: "https://nachitostore.vercel.app",
  whatsapp: "+59178096231",
  productionTime: "2 a 4 dias habiles",
  santaCruzDelivery: "Yango o recoger",
  nationalDelivery: "Flota jueves y viernes",
  bank: "Banco Mercantil Santa Cruz",
  paymentConcept: "NachitoStore",
  depositPercent: "50",
  botMode: "Semi automatico",
  orderExpiry: "24",
  proofReminder: "30",
  maxCartItems: "20"
};

function settingValue(settings: typeof defaultSettings, key: keyof typeof defaultSettings) {
  return settings[key];
}

export function ConfigurationSection({ adminEmail, onNotify }: ConfigurationSectionProps) {
  const [settings, setSettings] = useState(defaultSettings);
  const [copied, setCopied] = useState("");

  const webhookUrls = useMemo(() => ({
    ycloud: "https://admin-dhasboard.vercel.app/api/webhooks/n8n/waflow-bot",
    proofAi: "https://admin-dhasboard.vercel.app/api/webhooks/n8n/payment-proof-ai",
    gmail: "https://admin-dhasboard.vercel.app/api/webhooks/gmail/mercantil-payment",
    qr: "https://admin-dhasboard.vercel.app/payment/mercantil-qr.jpeg"
  }), []);

  const updateSetting = (key: keyof typeof defaultSettings, value: string) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const copyText = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    window.setTimeout(() => setCopied(""), 1800);
  };

  const saveLocalSettings = () => {
    onNotify("Configuracion lista en pantalla. Luego la guardamos en bot_settings para persistirla.");
  };

  return (
    <section className="section-workspace configuration-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Sistema</span>
          <h2>Configuracion operativa</h2>
          <p>Centraliza datos del negocio, pagos, bot, seguridad e integraciones para no tocar codigo cada vez.</p>
        </div>
        <button className="btn primary" onClick={saveLocalSettings} type="button">
          Guardar configuracion
        </button>
      </header>

      <div className="config-status-grid">
        <article className="section-summary-card">
          <span>Admin</span>
          <strong>{adminEmail}</strong>
          <small>Cuenta activa</small>
        </article>
        <article className="section-summary-card">
          <span>WhatsApp</span>
          <strong>{settings.whatsapp}</strong>
          <small>YCloud conectado</small>
        </article>
        <article className="section-summary-card">
          <span>Pagos</span>
          <strong>QR Mercantil</strong>
          <small>Sin comision</small>
        </article>
        <article className="section-summary-card">
          <span>IA</span>
          <strong>Gemini</strong>
          <small>Lectura de comprobantes</small>
        </article>
      </div>

      <div className="config-grid">
        <article className="panel config-card">
          <div className="panel-header">
            <div>
              <h3><IconWorld size={18} /> Tienda</h3>
              <p>Datos que usa el bot para responder claro.</p>
            </div>
          </div>
          <label>Nombre de tienda<input value={settings.storeName} onChange={(event) => updateSetting("storeName", event.target.value)} /></label>
          <label>Web<input value={settings.storeUrl} onChange={(event) => updateSetting("storeUrl", event.target.value)} /></label>
          <label>Tiempo de produccion<input value={settings.productionTime} onChange={(event) => updateSetting("productionTime", event.target.value)} /></label>
          <label>Entrega Santa Cruz<input value={settings.santaCruzDelivery} onChange={(event) => updateSetting("santaCruzDelivery", event.target.value)} /></label>
          <label>Entrega departamentos<input value={settings.nationalDelivery} onChange={(event) => updateSetting("nationalDelivery", event.target.value)} /></label>
        </article>

        <article className="panel config-card">
          <div className="panel-header">
            <div>
              <h3><IconQrcode size={18} /> Pagos</h3>
              <p>QR fijo y reglas del adelanto.</p>
            </div>
          </div>
          <label>Banco<input value={settings.bank} onChange={(event) => updateSetting("bank", event.target.value)} /></label>
          <label>Concepto<input value={settings.paymentConcept} onChange={(event) => updateSetting("paymentConcept", event.target.value)} /></label>
          <label>Adelanto (%)<input value={settings.depositPercent} onChange={(event) => updateSetting("depositPercent", event.target.value)} /></label>
          <div className="config-qr-preview">
            <img alt="QR Mercantil" src="/payment/mercantil-qr.jpeg" />
            <button className="link-btn" onClick={() => void copyText("qr", webhookUrls.qr)} type="button">
              <IconCopy size={15} /> {copied === "qr" ? "Copiado" : "Copiar URL QR"}
            </button>
          </div>
        </article>

        <article className="panel config-card">
          <div className="panel-header">
            <div>
              <h3><IconRobot size={18} /> Bot</h3>
              <p>Reglas para que el flujo sea seguro y no moleste al cliente.</p>
            </div>
          </div>
          <label>Modo<input value={settings.botMode} onChange={(event) => updateSetting("botMode", event.target.value)} /></label>
          <label>Recordatorio comprobante (min)<input value={settings.proofReminder} onChange={(event) => updateSetting("proofReminder", event.target.value)} /></label>
          <label>Expirar pedido sin pago (h)<input value={settings.orderExpiry} onChange={(event) => updateSetting("orderExpiry", event.target.value)} /></label>
          <label>Limite prendas carrito<input value={settings.maxCartItems} onChange={(event) => updateSetting("maxCartItems", event.target.value)} /></label>
          <div className="config-rule-list">
            <span>Responde solo si el pedido viene desde la web.</span>
            <span>No confirma pago solo por screenshot.</span>
            <span>Si Gemini falla, pasa a revision manual.</span>
          </div>
        </article>

        <article className="panel config-card">
          <div className="panel-header">
            <div>
              <h3><IconShieldLock size={18} /> Seguridad</h3>
              <p>Estado de conexiones y secretos.</p>
            </div>
          </div>
          <div className="integration-list">
            {[
              ["Supabase", "Base de datos conectada", IconDatabase],
              ["Gmail Mercantil", "Verifica correos de pago", IconMailCheck],
              ["YCloud", `WhatsApp ${settingValue(settings, "whatsapp")}`, IconBrandWhatsapp],
              ["Gemini", "Lee comprobantes con IA", IconShieldLock]
            ].map(([title, detail, Icon]) => (
              <div className="integration-row" key={title as string}>
                <Icon size={17} />
                <div>
                  <strong>{title as string}</strong>
                  <span>{detail as string}</span>
                </div>
                <em>Activo</em>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="panel webhook-panel">
        <div className="panel-header">
          <div>
            <h3>Webhooks del sistema</h3>
            <p>URLs utiles para n8n, YCloud y Gmail. No incluyen secretos.</p>
          </div>
        </div>
        <div className="webhook-grid">
          {Object.entries(webhookUrls).map(([key, value]) => (
            <button className="webhook-row" key={key} onClick={() => void copyText(key, value)} type="button">
              <span>{key}</span>
              <strong>{value}</strong>
              <em>{copied === key ? "Copiado" : "Copiar"}</em>
            </button>
          ))}
        </div>
      </article>
    </section>
  );
}
