import { NextResponse } from "next/server";
import { parseProofEvidence } from "@/lib/paymentVerification";
import { RequestSecurityError, assertBodySize, cleanText, secureJsonHeaders } from "@/lib/requestSecurity";

const maxBodyBytes = 7 * 1024 * 1024;
const maxRemoteMediaBytes = 6 * 1024 * 1024;
const openaiResponsesUrl = "https://api.openai.com/v1/responses";
const geminiApiBaseUrl = "https://generativelanguage.googleapis.com/v1beta/models";

interface PaymentProofAiPayload {
  text?: string;
  proofText?: string;
  expectedAmount?: number;
  orderReference?: string;
  customerName?: string;
  phone?: string;
  message?: {
    type?: string;
    body?: string;
    text?: string;
    attachments?: Array<{
      id?: string;
      url?: string;
      link?: string;
      data_url?: string;
      file_url?: string;
      mime_type?: string;
      mimeType?: string;
      file_name?: string;
      filename?: string;
      name?: string;
      type?: string;
    }>;
  };
}

function webhookSecret() {
  return process.env.N8N_WEBHOOK_SECRET || process.env.POLERAFLOW_WEBHOOK_SECRET;
}

function hasValidSecret(request: Request) {
  const secret = webhookSecret();
  const auth = request.headers.get("authorization") ?? "";
  const headerSecret = request.headers.get("x-poleraflow-webhook-secret") ?? "";

  return Boolean(secret && (auth === `Bearer ${secret}` || headerSecret === secret));
}

function firstAttachment(payload: PaymentProofAiPayload) {
  return Array.isArray(payload.message?.attachments) ? payload.message.attachments[0] : undefined;
}

function attachmentUrl(payload: PaymentProofAiPayload) {
  const first = firstAttachment(payload);
  const directUrl = cleanText(first?.data_url ?? first?.file_url ?? first?.url ?? first?.link, 4000);
  if (directUrl) return directUrl;

  const ycloudMediaId = cleanText(first?.id, 180);
  return ycloudMediaId ? `https://api.ycloud.com/v2/whatsapp/media/download/${encodeURIComponent(ycloudMediaId)}` : undefined;
}

function attachmentMime(payload: PaymentProofAiPayload) {
  const first = firstAttachment(payload);
  const mime = cleanText(first?.mime_type ?? first?.mimeType, 120).toLowerCase();
  if (mime) return mime;

  const url = attachmentUrl(payload)?.toLowerCase() ?? "";
  if (url.startsWith("data:application/pdf")) return "application/pdf";
  if (url.startsWith("data:image/")) return url.slice(5, url.indexOf(";"));
  if (url.includes(".pdf")) return "application/pdf";
  if (url.match(/\.(png|jpg|jpeg|webp)(\?|$)/)) return "image";
  return cleanText(firstAttachment(payload)?.type ?? payload.message?.type, 60).toLowerCase();
}

function normalizedMimeType(value: string) {
  const mime = value.toLowerCase();
  if (mime.includes("pdf")) return "application/pdf";
  if (mime.includes("png")) return "image/png";
  if (mime.includes("webp")) return "image/webp";
  if (mime.includes("jpg") || mime.includes("jpeg")) return "image/jpeg";
  if (mime.startsWith("image/")) return mime;
  return "image/jpeg";
}

function attachmentFileName(payload: PaymentProofAiPayload) {
  const first = firstAttachment(payload);
  return cleanText(first?.file_name ?? first?.filename ?? first?.name, 180) || "comprobante.pdf";
}

function isAllowedRemoteUrl(value: string) {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const blockedHosts = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
    const privateIp =
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);

    return url.protocol === "https:" && !blockedHosts.includes(hostname) && !privateIp;
  } catch {
    return false;
  }
}

function dataUrlToInlineData(dataUrl: string, fallbackMime: string) {
  const match = dataUrl.match(/^data:([^;,]+)?;base64,([\s\S]+)$/i);
  if (!match) return null;
  return {
    mimeType: normalizedMimeType(match[1] || fallbackMime),
    data: match[2].replace(/\s/g, "")
  };
}

async function remoteUrlToInlineData(mediaUrl: string, fallbackMime: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const url = new URL(mediaUrl);
    const headers: Record<string, string> = {};
    if (url.hostname.toLowerCase() === "api.ycloud.com" && process.env.YCLOUD_API_KEY) {
      headers["X-API-Key"] = process.env.YCLOUD_API_KEY;
    }

    const response = await fetch(mediaUrl, { signal: controller.signal, headers });
    if (!response.ok) return { ok: false, reason: "media_download_failed", status: response.status };

    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (contentLength > maxRemoteMediaBytes) return { ok: false, reason: "media_too_large" };

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength > maxRemoteMediaBytes) return { ok: false, reason: "media_too_large" };

    const contentType = response.headers.get("content-type") ?? fallbackMime;
    return {
      ok: true,
      inlineData: {
        mimeType: normalizedMimeType(contentType),
        data: Buffer.from(arrayBuffer).toString("base64")
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildPrompt(payload: PaymentProofAiPayload) {
  return [
    "Lee este comprobante de pago de Bolivia para Nachito Store.",
    "Extrae solo datos visibles. No inventes datos.",
    "Devuelve SOLO JSON valido con esta forma:",
    '{"amount":number|null,"payerName":string|null,"reference":string|null,"notificationNumber":string|null,"bankName":string|null,"paidAtText":string|null,"confidence":number,"rawText":string,"warnings":string[]}',
    `Monto esperado si existe: ${payload.expectedAmount ?? "desconocido"} Bs.`,
    `Pedido/referencia si existe: ${payload.orderReference ?? "desconocido"}.`,
    `Cliente esperado si existe: ${payload.customerName ?? "desconocido"}.`,
    "confidence debe ser 0 a 1 segun claridad del comprobante."
  ].join("\n");
}

function parseJsonObject(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const source = fenced ?? trimmed.match(/\{[\s\S]*\}/)?.[0] ?? trimmed;

  try {
    return JSON.parse(source) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function responseOutputText(response: Record<string, unknown>) {
  const direct = cleanText(response.output_text, 10_000);
  if (direct) return direct;

  const output = Array.isArray(response.output) ? response.output : [];
  return output
    .flatMap((item) => (Array.isArray((item as { content?: unknown[] }).content) ? (item as { content: unknown[] }).content : []))
    .map((content) => cleanText((content as { text?: unknown }).text, 10_000))
    .filter(Boolean)
    .join("\n");
}

async function analyzeWithOpenAi(payload: PaymentProofAiPayload, mediaUrl: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { ok: false, reason: "missing_openai_api_key" };

  const mime = attachmentMime(payload);
  const content: Array<Record<string, unknown>> = [
    { type: "input_text", text: buildPrompt(payload) }
  ];

  if (mime.includes("pdf")) {
    content.push({
      type: "input_file",
      filename: attachmentFileName(payload),
      ...(mediaUrl.startsWith("data:") ? { file_data: mediaUrl } : { file_url: mediaUrl })
    });
  } else {
    content.push({
      type: "input_image",
      image_url: mediaUrl,
      detail: "high"
    });
  }

  const response = await fetch(openaiResponsesUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PROOF_MODEL || "gpt-4o-mini",
      input: [
        {
          role: "user",
          content
        }
      ],
      max_output_tokens: 900
    })
  });

  if (!response.ok) {
    return { ok: false, reason: "openai_request_failed", status: response.status };
  }

  const json = (await response.json()) as Record<string, unknown>;
  const outputText = responseOutputText(json);
  const parsed = parseJsonObject(outputText);
  if (!parsed) return { ok: false, reason: "ai_json_parse_failed", rawText: outputText };

  return {
    ok: true,
    evidence: {
      amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
      payerName: cleanText(parsed.payerName, 160) || undefined,
      reference: cleanText(parsed.reference, 80) || undefined,
      notificationNumber: cleanText(parsed.notificationNumber, 80) || undefined,
      bankName: cleanText(parsed.bankName, 120) || undefined,
      paidAtText: cleanText(parsed.paidAtText, 120) || undefined,
      rawText: cleanText(parsed.rawText ?? outputText, 6000) || outputText.slice(0, 6000),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((warning) => cleanText(warning, 160)).filter(Boolean) : []
    }
  };
}

function geminiOutputText(response: Record<string, unknown>) {
  const candidates = Array.isArray(response.candidates) ? response.candidates : [];
  return candidates
    .flatMap((candidate) => {
      const content = (candidate as { content?: { parts?: unknown[] } }).content;
      return Array.isArray(content?.parts) ? content.parts : [];
    })
    .map((part) => cleanText((part as { text?: unknown }).text, 10_000))
    .filter(Boolean)
    .join("\n");
}

async function analyzeWithGemini(payload: PaymentProofAiPayload, mediaUrl: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false, reason: "missing_gemini_api_key" };

  const mime = normalizedMimeType(attachmentMime(payload));
  const inlineData = mediaUrl.startsWith("data:")
    ? dataUrlToInlineData(mediaUrl, mime)
    : (await remoteUrlToInlineData(mediaUrl, mime));

  if (!inlineData) return { ok: false, reason: "invalid_data_url" };
  if ("ok" in inlineData && !inlineData.ok) return inlineData;

  const media = (
    "inlineData" in inlineData
      ? inlineData.inlineData
      : inlineData
  ) as { mimeType: string; data: string };
  const model = process.env.GEMINI_PROOF_MODEL || "gemini-2.5-flash";
  const response = await fetch(`${geminiApiBaseUrl}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [
            { text: buildPrompt(payload) },
            {
              inline_data: {
                mime_type: media.mimeType,
                data: media.data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 900,
        responseMimeType: "application/json"
      }
    })
  });

  if (!response.ok) {
    return { ok: false, reason: "gemini_request_failed", status: response.status };
  }

  const json = (await response.json()) as Record<string, unknown>;
  const outputText = geminiOutputText(json);
  const parsed = parseJsonObject(outputText);
  if (!parsed) return { ok: false, reason: "ai_json_parse_failed", rawText: outputText };

  return {
    ok: true,
    evidence: {
      amount: typeof parsed.amount === "number" ? parsed.amount : undefined,
      payerName: cleanText(parsed.payerName, 160) || undefined,
      reference: cleanText(parsed.reference, 80) || undefined,
      notificationNumber: cleanText(parsed.notificationNumber, 80) || undefined,
      bankName: cleanText(parsed.bankName, 120) || undefined,
      paidAtText: cleanText(parsed.paidAtText, 120) || undefined,
      rawText: cleanText(parsed.rawText ?? outputText, 6000) || outputText.slice(0, 6000),
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0))),
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings.map((warning) => cleanText(warning, 160)).filter(Boolean) : []
    }
  };
}

async function analyzeProofWithAi(payload: PaymentProofAiPayload, mediaUrl: string) {
  const provider = cleanText(process.env.PROOF_AI_PROVIDER, 40).toLowerCase();

  if (provider === "openai") return analyzeWithOpenAi(payload, mediaUrl);
  if (provider === "gemini") return analyzeWithGemini(payload, mediaUrl);

  const gemini = await analyzeWithGemini(payload, mediaUrl);
  if (gemini.ok) return gemini;

  const openai = await analyzeWithOpenAi(payload, mediaUrl);
  if (openai.ok) return openai;

  return {
    ok: false,
    reason: `gemini:${gemini.reason ?? "unavailable"};openai:${openai.reason ?? "unavailable"}`,
    gemini,
    openai
  };
}

export async function POST(request: Request) {
  try {
    assertBodySize(request, maxBodyBytes);

    if (!hasValidSecret(request)) {
      throw new RequestSecurityError("Webhook no autorizado.", 401);
    }

    const payload = (await request.json()) as PaymentProofAiPayload;
    const existingText = cleanText(payload.proofText ?? payload.text ?? payload.message?.body ?? payload.message?.text, 6000);
    const mediaUrl = attachmentUrl(payload);

    if (!mediaUrl) {
      const fallbackEvidence = parseProofEvidence(existingText);
      return NextResponse.json(
        {
          ok: true,
          aiAvailable: false,
          ignored: true,
          reason: "no_attachment",
          proofText: existingText,
          proofEvidence: fallbackEvidence
        },
        { headers: secureJsonHeaders(request) }
      );
    }

    if (!mediaUrl.startsWith("data:") && !isAllowedRemoteUrl(mediaUrl)) {
      throw new RequestSecurityError("URL de comprobante no permitida.", 400);
    }

    const ai = await analyzeProofWithAi(payload, mediaUrl);
    const fallbackEvidence = parseProofEvidence(existingText);
    const evidence = ai.ok && "evidence" in ai ? (ai.evidence as Record<string, unknown>) : fallbackEvidence;
    const proofText = cleanText((evidence.rawText as string | undefined) ?? existingText, 6000);

    return NextResponse.json(
      {
        ok: true,
        aiAvailable: ai.ok,
        aiReason: ai.ok ? "ai_extracted" : ai.reason,
        proofText,
        proofEvidence: evidence
      },
      { headers: secureJsonHeaders(request) }
    );
  } catch (error) {
    const status = error instanceof RequestSecurityError ? error.status : 400;
    const message = error instanceof Error ? error.message : "No se pudo analizar el comprobante con IA.";

    return NextResponse.json({ ok: false, error: message }, { status, headers: secureJsonHeaders(request) });
  }
}
