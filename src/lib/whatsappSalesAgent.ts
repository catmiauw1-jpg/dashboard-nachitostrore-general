import { cleanText } from "@/lib/requestSecurity";
import { formatWhatsappMessage } from "@/lib/whatsappMessageFormatting";
import { fetchWithTimeout, getWhatsappAiTimeoutMs } from "@/lib/fetchWithTimeout";

type SalesAgentMessage = {
  role: "system" | "user";
  content: string;
};

export type WhatsappSalesAgentContext = {
  customerName: string;
  customerPhone?: string;
  incomingText: string;
  stage: string;
  fallbackReply: string;
  order?: {
    type?: string;
    product?: string;
    color?: string;
    size?: string;
    quantity?: number;
    total?: number;
    details?: string;
    items?: Array<{
      product?: string;
      color?: string;
      size?: string;
      quantity?: number;
      lineTotal?: number;
    }>;
  };
  deliveryArea?: string;
  deliveryDepartment?: string;
  paymentChoice?: string;
  paymentAmount?: number;
};

const storeKnowledge = [
  "Eres el vendedor de WhatsApp de Nachito Store.",
  "Responde como una persona amable, clara y breve. Maximo 2 parrafos cortos.",
  "No saludes de nuevo en cada respuesta. Saluda solo cuando el cliente inicia la conversacion con un saludo.",
  "No repitas el enlace de la web en preguntas informativas. Compartelo solo si el cliente quiere comprar, cotizar o iniciar otro pedido.",
  "No repitas mensajes iguales. No mandes el QR a menos que el flujo de pago lo pida.",
  "Si el cliente esta molesto, disculpate y responde directo sin discutir.",
  "Si hay un pedido abierto, conserva el contexto y no lo reinicies salvo que el cliente pida cancelar, cambiar o pedido nuevo.",
  "Si el pago ya esta en revision, explica que estas verificando el comprobante con el correo del banco y que le avisaras.",
  "Si el pago esta confirmado, di que el pedido esta en preparacion y demora 2 a 4 dias habiles.",
  "Si no hay pedido y quiere comprar, orientalo a la web: https://nachitostore.vercel.app/",
  "Datos del negocio:",
  "- Poleras oversize de 200 g, algodon premium, cuello reforzado de 3 cm.",
  "- Estampado DTF semitono, colores intensos y buena duracion.",
  "- Colores: blanco arena y negro.",
  "- Tallas: M, L y XL.",
  "- Medidas referenciales: M ancho 56 cm, largo 72 cm, manga 42 cm; L ancho 58 cm, largo 75 cm, manga 43 cm; XL ancho 60 cm, largo 78 cm, manga 44 cm.",
  "- Catalogo: Bs 125 a Bs 180 segun diseno. Personalizadas desde Bs 155.",
  "- Produccion: 2 a 4 dias habiles desde que se confirma el pago.",
  "- Santa Cruz: Yango o recoger; costo adicional si es envio.",
  "- Otros departamentos: flota jueves y viernes; costo adicional.",
  "No inventes stock, precios exactos de productos no mencionados, bancos ni datos de pago."
].join("\n");

function buildUserPrompt(context: WhatsappSalesAgentContext) {
  return [
    "Contexto actual del chat:",
    JSON.stringify(
      {
        cliente: context.customerName,
        telefono: context.customerPhone,
        etapa: context.stage,
        pedido: context.order ?? null,
        entrega: {
          zona: context.deliveryArea,
          departamento: context.deliveryDepartment
        },
        pago: {
          opcion: context.paymentChoice,
          monto: context.paymentAmount
        }
      },
      null,
      2
    ),
    "",
    `Mensaje del cliente: ${context.incomingText || "[sin texto]"}`,
    "",
    `Respuesta base segura si necesitas usarla: ${context.fallbackReply}`,
    "",
    "Escribe SOLO el mensaje que se enviara por WhatsApp."
  ].join("\n");
}

async function callOpenAiCompatible(messages: SalesAgentMessage[]) {
  const baseUrl = cleanText(
    process.env.WHATSAPP_AI_BASE_URL ??
      process.env.SALES_AI_BASE_URL ??
      process.env.PAYMENT_AI_BASE_URL ??
      process.env.PROOF_AI_BASE_URL,
    500
  ).replace(/\/$/, "");
  const model = cleanText(
    process.env.WHATSAPP_AI_MODEL ?? process.env.SALES_AI_MODEL ?? process.env.PAYMENT_AI_MODEL ?? process.env.PROOF_AI_MODEL,
    160
  );
  const apiKey =
    process.env.WHATSAPP_AI_API_KEY ??
    process.env.SALES_AI_API_KEY ??
    process.env.PAYMENT_AI_API_KEY ??
    process.env.PROOF_AI_API_KEY;

  if (!baseUrl || !model) return null;

  const json = await fetchWithTimeout(async (signal) => {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({ model, messages, temperature: 0.35, max_tokens: 220 })
    });
    if (!response.ok) return null;
    return (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  }, getWhatsappAiTimeoutMs());

  if (!json) return null;
  return formatWhatsappMessage(json.choices?.[0]?.message?.content, 1200);
}

async function callGemini(messages: SalesAgentMessage[]) {
  const apiKey = process.env.GEMINI_API_KEY ?? process.env.WHATSAPP_GEMINI_API_KEY;
  const model = cleanText(
    process.env.WHATSAPP_GEMINI_MODEL ?? process.env.GEMINI_SALES_MODEL ?? process.env.GEMINI_PROOF_MODEL ?? "gemini-2.5-flash",
    120
  );
  if (!apiKey || !model) return null;

  const json = await fetchWithTimeout(async (signal) => {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: messages.find((message) => message.role === "system")?.content ?? storeKnowledge }] },
        contents: [{
          role: "user",
          parts: [{ text: messages.filter((message) => message.role === "user").map((message) => message.content).join("\n\n") }]
        }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 220 }
      })
    });
    if (!response.ok) return null;
    return (await response.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  }, getWhatsappAiTimeoutMs());

  if (!json) return null;
  return formatWhatsappMessage(json.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n"), 1200);
}

async function callOllama(messages: SalesAgentMessage[]) {
  const baseUrl = cleanText(process.env.WHATSAPP_AI_BASE_URL ?? process.env.SALES_AI_BASE_URL, 500).replace(/\/$/, "") || "http://127.0.0.1:11434";
  const model = cleanText(process.env.WHATSAPP_AI_MODEL ?? process.env.SALES_AI_MODEL, 120);
  if (!model) return null;

  const json = await fetchWithTimeout(async (signal) => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, stream: false, options: { temperature: 0.35, num_predict: 220 } })
    });
    if (!response.ok) return null;
    return (await response.json()) as { message?: { content?: string } };
  }, getWhatsappAiTimeoutMs());

  if (!json) return null;
  return formatWhatsappMessage(json.message?.content, 1200);
}

function cleanAgentReply(reply: string, fallback: string) {
  const cleaned = formatWhatsappMessage(reply, 1200)
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) return fallback;
  if (/^(null|undefined|\{\s*\})$/i.test(cleaned)) return fallback;
  return cleaned;
}

export async function generateWhatsappSalesReply(context: WhatsappSalesAgentContext) {
  const provider = cleanText(
    process.env.WHATSAPP_AI_PROVIDER ??
      process.env.SALES_AI_PROVIDER ??
      process.env.PAYMENT_AI_PROVIDER ??
      process.env.PROOF_AI_PROVIDER,
    60
  ).toLowerCase();
  if (provider === "disabled" || provider === "none") return context.fallbackReply;

  const messages: SalesAgentMessage[] = [
    { role: "system", content: process.env.WHATSAPP_AI_SYSTEM_PROMPT || storeKnowledge },
    { role: "user", content: buildUserPrompt(context) }
  ];

  try {
    const output =
      provider === "ollama"
        ? await callOllama(messages)
        : provider === "gemini"
          ? await callGemini(messages)
          : (await callOpenAiCompatible(messages)) ?? (await callGemini(messages));

    return cleanAgentReply(output ?? "", context.fallbackReply);
  } catch {
    return context.fallbackReply;
  }
}
