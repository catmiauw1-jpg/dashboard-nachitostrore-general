import { jsonHeaders } from "@/lib/catalogStore";
import { createSupabaseAdminClient } from "@/lib/supabase";

const orderBuckets = new Map<string, { count: number; resetAt: number }>();
interface RateLimitOptions {
  limit: number;
  windowMs: number;
  scope?: string;
}

const productionOrigins = [
  "https://nachitostore.vercel.app",
  "https://admin-dhasboard.vercel.app"
];

const devOrigins =
  process.env.NODE_ENV === "development"
    ? [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5500",
        "http://127.0.0.1:5501"
      ]
    : [];

const allowedOrigins = new Set([...productionOrigins, ...devOrigins]);

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
    headers["Access-Control-Allow-Origin"] = allowedOrigins.has(origin)
      ? origin
      : "https://nachitostore.vercel.app";
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

function requestIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip") || "unknown";
}

function assertMemoryRateLimit(request: Request, options: RateLimitOptions = { limit: 12, windowMs: 60_000 }) {
  const ip = requestIp(request);
  const key = `${options.scope ?? "default"}:${ip}`;
  const now = Date.now();
  const bucket = orderBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    orderBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
    return;
  }

  bucket.count += 1;

  if (bucket.count > options.limit) {
    throw new RequestSecurityError("Demasiados intentos. Espera un momento y vuelve a intentar.", 429);
  }
}

export async function assertRateLimit(request: Request, options: RateLimitOptions = { limit: 12, windowMs: 60_000 }) {
  const supabase = createSupabaseAdminClient();
  const ip = requestIp(request);
  const userAgent = cleanText(request.headers.get("user-agent"), 120);
  const origin = cleanText(request.headers.get("origin"), 120);
  const bucketKey = `${options.scope ?? "orders"}:${ip}:${origin}:${userAgent}`;

  if (!supabase) {
    assertMemoryRateLimit(request, options);
    return;
  }

  const { data, error } = await supabase.rpc("check_api_rate_limit", {
    p_bucket_key: bucketKey,
    p_limit: options.limit,
    p_window_seconds: Math.ceil(options.windowMs / 1000)
  });

  if (error) {
    console.warn("Persistent rate limit failed; using memory fallback.", error.message);
    assertMemoryRateLimit(request, options);
    return;
  }

  if (!data) {
    throw new RequestSecurityError("Demasiados intentos. Espera un momento y vuelve a intentar.", 429);
  }
}

export function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}
