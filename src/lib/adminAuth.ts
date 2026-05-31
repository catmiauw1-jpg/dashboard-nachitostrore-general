import type { User } from "@supabase/supabase-js";
import { RequestSecurityError } from "@/lib/requestSecurity";
import { createSupabasePublicClient } from "@/lib/supabase";

function adminEmailSet() {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(user: User | null | undefined) {
  const email = user?.email?.toLowerCase();
  if (!email) return false;

  return adminEmailSet().has(email);
}

export function adminConfigReady() {
  return adminEmailSet().size > 0;
}

export async function requireAdminRequest(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";

  if (!token) {
    throw new RequestSecurityError("Inicia sesion como administrador.", 401);
  }

  const supabase = createSupabasePublicClient();
  if (!supabase || !adminConfigReady()) {
    throw new RequestSecurityError("Acceso admin no configurado.", 503);
  }

  const { data, error } = await supabase.auth.getUser(token);

  if (error || !isAdminUser(data.user)) {
    throw new RequestSecurityError("No autorizado.", 403);
  }

  return data.user;
}
