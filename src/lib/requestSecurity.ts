import { jsonHeaders } from "@/lib/catalogStore";

const orderBuckets = new Map<string, { count: number; resetAt: number }>();
const allowedOrigins = new Set([
  "https://nachitostore.vercel.app",
  "https://admin-dhasboard.vercel.app",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5500"
]);

export class RequestSecurityError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function secureJsonHeaders(request?: Request) {
  const headers: Record<string, string> = { ...jsonHeaders() };
  const origin = request?.headers.get("origin");

  if (origin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigins.has(origin) ? origin : "https://nachitostore.vercel.app";
    headers.Vary = "Origin";
  }

  return headers;
}

export function assertAllowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    throw new RequestSecurityError("Origen no permitido.", 403);
  }
}

export function assertBodySize(request: Request, maxBytes: number) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maxBytes) {
    throw new RequestSecurityError("La solicitud es demasiado grande.", 413);
  }
}

export function assertRateLimit(request: Request, options = { limit: 12, windowMs: 60_000 }) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  const now = Date.now();
  const bucket = orderBuckets.get(ip);

  if (!bucket || bucket.resetAt <= now) {
    orderBuckets.set(ip, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  bucket.count += 1;

  if (bucket.count > options.limit) {
    throw new RequestSecurityError("Demasiados intentos. Espera un momento y vuelve a intentar.", 429);
  }
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}
