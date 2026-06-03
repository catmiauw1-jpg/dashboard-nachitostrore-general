import { createSupabaseAdminClient } from "@/lib/supabase";
import type { Customer, Order, SalesChannel } from "@/types";

interface CustomerRow {
  id: string;
  full_name: string;
  phone: string;
  channel: SalesChannel;
  address: string | null;
  preferred_size: string | null;
  preferred_color: string | null;
  notes: string | null;
  created_at: string | null;
  updated_at: string | null;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, maxLength) : "";
}

function normalizePhone(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "").slice(0, 24) : "";
}

function rowToCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.full_name,
    phone: row.phone,
    channel: row.channel,
    notes: row.notes ?? undefined,
    address: row.address ?? undefined,
    preferredSize: row.preferred_size ?? undefined,
    preferredColor: row.preferred_color ?? undefined,
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined
  };
}

export async function readCustomers(): Promise<Customer[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("customers")
    .select("id, full_name, phone, channel, address, preferred_size, preferred_color, notes, created_at, updated_at")
    .order("updated_at", { ascending: false });

  if (error) {
    console.warn("Supabase customers read failed.", error.message);
    return [];
  }

  return (data as CustomerRow[]).map(rowToCustomer);
}

export async function upsertCustomerFromOrder(order: Order): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  const phone = normalizePhone(order.customerPhone);
  if (!supabase || !phone) return null;

  const fullName = cleanText(order.customer, 80) || "Cliente web";
  const { data, error } = await supabase
    .from("customers")
    .upsert(
      {
        full_name: fullName,
        phone,
        channel: order.channel,
        preferred_size: cleanText(order.size, 20) || null,
        preferred_color: cleanText(order.color, 60) || null
      },
      { onConflict: "phone" }
    )
    .select("id")
    .single();

  if (error) {
    console.warn("Supabase customer upsert failed.", error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function updateCustomerNotes(customerId: string, notes: string): Promise<Customer[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { error } = await supabase
    .from("customers")
    .update({ notes: cleanText(notes, 1000) })
    .eq("id", customerId);

  if (error) throw new Error(error.message);

  return readCustomers();
}
