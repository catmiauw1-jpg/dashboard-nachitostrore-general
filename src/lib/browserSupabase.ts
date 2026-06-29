"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
let browserClient: SupabaseClient | null | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient !== undefined) return browserClient;
  if (!supabaseUrl || !supabasePublishableKey) {
    browserClient = null;
    return browserClient;
  }

  browserClient = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  return browserClient;
}
