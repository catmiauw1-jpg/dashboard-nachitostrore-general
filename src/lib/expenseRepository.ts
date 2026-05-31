import { createSupabaseAdminClient } from "@/lib/supabase";
import type { Expense, ExpenseCategory, ExpenseScope } from "@/types";

interface ExpenseRow {
  id: string;
  expense_scope?: ExpenseScope | null;
  title: string;
  category: ExpenseCategory;
  amount: number | string | null;
  expense_date: string;
  notes: string | null;
  created_at: string | null;
}

interface ExpenseNotesPayload {
  scope?: ExpenseScope;
  notes?: string;
}

function parseNotes(value: string | null): ExpenseNotesPayload {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as ExpenseNotesPayload;
    return typeof parsed === "object" && parsed ? parsed : { notes: value };
  } catch {
    return { notes: value };
  }
}

function serializeNotes(expense: Omit<Expense, "id">) {
  return JSON.stringify({
    scope: expense.scope,
    notes: expense.notes
  });
}

function rowToExpense(row: ExpenseRow): Expense {
  const notes = parseNotes(row.notes);

  return {
    id: row.id,
    scope: row.expense_scope === "Personal" || notes.scope === "Personal" ? "Personal" : "Tienda",
    title: row.title,
    category: row.category,
    amount: Number(row.amount ?? 0),
    expenseDate: row.expense_date,
    notes: notes.notes ?? row.notes ?? undefined,
    createdAt: row.created_at ?? undefined
  };
}

function cleanExpense(expense: Expense): Omit<Expense, "id"> {
  return {
    scope: expense.scope === "Personal" ? "Personal" : "Tienda",
    title: String(expense.title ?? "").trim().slice(0, 120) || "Gasto",
    category: expense.category || "Otro",
    amount: Math.max(0, Number(expense.amount) || 0),
    expenseDate: expense.expenseDate || new Date().toISOString().slice(0, 10),
    notes: expense.notes?.trim().slice(0, 500) || undefined,
    createdAt: expense.createdAt
  };
}

export async function readExpenses(): Promise<Expense[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const query = supabase
    .from("expenses")
    .select("id, expense_scope, title, category, amount, expense_date, notes, created_at")
    .order("expense_date", { ascending: false })
    .order("created_at", { ascending: false });
  const { data, error } = await query;

  if (error?.message.toLowerCase().includes("expense_scope")) {
    const fallback = await supabase
      .from("expenses")
      .select("id, title, category, amount, expense_date, notes, created_at")
      .order("expense_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (fallback.error) {
      console.warn("Supabase expenses read failed.", fallback.error.message);
      return [];
    }

    return (fallback.data as ExpenseRow[]).map(rowToExpense);
  }

  if (error) {
    console.warn("Supabase expenses read failed.", error.message);
    return [];
  }

  return (data as ExpenseRow[]).map(rowToExpense);
}

export async function createExpense(expense: Expense): Promise<Expense[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [expense];

  const clean = cleanExpense(expense);
  const { error } = await supabase.from("expenses").insert({
    expense_scope: clean.scope,
    title: clean.title,
    category: clean.category,
    amount: clean.amount,
    expense_date: clean.expenseDate,
    notes: clean.notes
  });

  if (error?.message.toLowerCase().includes("expense_scope")) {
    const fallback = await supabase.from("expenses").insert({
      title: clean.title,
      category: clean.category,
      amount: clean.amount,
      expense_date: clean.expenseDate,
      notes: serializeNotes(clean)
    });

    if (fallback.error) throw new Error(fallback.error.message);
  } else if (error) {
    throw new Error(error.message);
  }

  return readExpenses();
}

export async function deleteExpense(expenseId: string): Promise<Expense[]> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) return [];

  const { error } = await supabase.from("expenses").delete().eq("id", expenseId);
  if (error) throw new Error(error.message);

  return readExpenses();
}
