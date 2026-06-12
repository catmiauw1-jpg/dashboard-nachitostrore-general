"use client";

import { useMemo, useState, type FormEvent } from "react";
import { formatCurrency } from "@/lib/format";
import type { Expense, ExpenseCategory, ExpenseScope, Order } from "@/types";

interface ExpensesSectionProps {
  expenses: Expense[];
  orders: Order[];
  onAddExpense: (expense: Expense) => Promise<void> | void;
  onDeleteExpense: (expenseId: string) => Promise<void> | void;
}

const scopes: ExpenseScope[] = ["Tienda", "Personal"];
const categories: ExpenseCategory[] = [
  "Poleras",
  "DTF",
  "Empaques",
  "Publicidad",
  "Entrega",
  "Herramientas",
  "Servicios",
  "Personal",
  "Otro"
];

const today = () => new Date().toISOString().slice(0, 10);

function expenseDateLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function expenseId() {
  return `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ExpensesSection({ expenses, orders, onAddExpense, onDeleteExpense }: ExpensesSectionProps) {
  const [scope, setScope] = useState<ExpenseScope>("Tienda");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("Poleras");
  const [amount, setAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [filter, setFilter] = useState<"Todos" | ExpenseScope>("Todos");
  const [query, setQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const visibleExpenses = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return expenses.filter((expense) => {
      const matchesScope = filter === "Todos" || expense.scope === filter;
      const matchesQuery = !normalizedQuery ||
        [expense.title, expense.category, expense.notes, expense.scope]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery);

      return matchesScope && matchesQuery;
    });
  }, [expenses, filter, query]);

  const businessExpensesTotal = expenses
    .filter((expense) => expense.scope === "Tienda")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const personalExpensesTotal = expenses
    .filter((expense) => expense.scope === "Personal")
    .reduce((sum, expense) => sum + expense.amount, 0);
  const totalSales = orders
    .filter((order) => order.status !== "Cancelado")
    .reduce((sum, order) => sum + order.total, 0);
  const estimatedMargin = Math.round(totalSales * 0.35);
  const estimatedProfit = Math.max(0, estimatedMargin - businessExpensesTotal);
  const afterPersonalExpenses = Math.max(0, estimatedProfit - personalExpensesTotal);

  const categoryTotals = categories
    .map((item) => ({
      category: item,
      total: expenses
        .filter((expense) => expense.scope === "Tienda" && expense.category === item)
        .reduce((sum, expense) => sum + expense.amount, 0)
    }))
    .filter((item) => item.total > 0)
    .sort((a, b) => b.total - a.total);

  const resetForm = () => {
    setScope("Tienda");
    setTitle("");
    setCategory("Poleras");
    setAmount("");
    setExpenseDate(today());
    setNotes("");
  };

  const submitExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanTitle = title.trim();
    const numericAmount = Number(amount);

    if (!cleanTitle || !Number.isFinite(numericAmount) || numericAmount <= 0) return;

    setIsSaving(true);
    try {
      await onAddExpense({
        id: expenseId(),
        scope,
        title: cleanTitle,
        category,
        amount: numericAmount,
        expenseDate,
        notes: notes.trim() || undefined
      });
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="section-workspace expenses-workspace">
      <header className="section-head">
        <div>
          <span className="section-kicker">Finanzas</span>
          <h2>Gastos</h2>
          <p>Controla ventas acumuladas, gastos de tienda, gastos personales y ganancia real estimada.</p>
        </div>
      </header>

      <div className="section-summary-grid expenses-summary-grid">
        <article className="section-summary-card">
          <span>Ventas totales</span>
          <strong>{formatCurrency(totalSales)}</strong>
          <small>Todo lo vendido no cancelado</small>
        </article>
        <article className="section-summary-card">
          <span>Gastos tienda</span>
          <strong>{formatCurrency(businessExpensesTotal)}</strong>
          <small>Afecta la ganancia</small>
        </article>
        <article className="section-summary-card">
          <span>Gastos personales</span>
          <strong>{formatCurrency(personalExpensesTotal)}</strong>
          <small>No se mezcla con tienda</small>
        </article>
        <article className="section-summary-card">
          <span>Ganancia estimada</span>
          <strong>{formatCurrency(estimatedProfit)}</strong>
          <small>Margen estimado menos gastos tienda</small>
        </article>
        <article className="section-summary-card">
          <span>Libre despues de personales</span>
          <strong>{formatCurrency(afterPersonalExpenses)}</strong>
          <small>Ganancia estimada menos personales</small>
        </article>
      </div>

      <div className="expenses-layout">
        <article className="panel expense-form-panel">
          <div className="panel-header">
            <div>
              <h3>Registrar gasto</h3>
              <p>Guarda compras de poleras, DTF, empaques, publicidad o gastos personales.</p>
            </div>
            <span className="badge accent">Nuevo</span>
          </div>

          <form className="expense-form" onSubmit={submitExpense}>
            <div className="segmented-control expense-scope-control">
              {scopes.map((item) => (
                <button
                  className={scope === item ? "active" : undefined}
                  key={item}
                  onClick={() => setScope(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>

            <label>
              <span>Detalle</span>
              <input
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ej: 12 poleras blanco arena"
                value={title}
              />
            </label>

            <div className="expense-form-grid">
              <label>
                <span>Categoría</span>
                <select onChange={(event) => setCategory(event.target.value as ExpenseCategory)} value={category}>
                  {categories.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>Monto</span>
                <input
                  min="0"
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="0"
                  step="0.01"
                  type="number"
                  value={amount}
                />
              </label>

              <label>
                <span>Fecha</span>
                <input onChange={(event) => setExpenseDate(event.target.value)} type="date" value={expenseDate} />
              </label>
            </div>

            <label>
              <span>Notas</span>
              <textarea
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Proveedor, motivo, comprobante o detalle interno."
                value={notes}
              />
            </label>

            <button className="btn primary" disabled={isSaving || !title.trim() || Number(amount) <= 0} type="submit">
              {isSaving ? "Guardando..." : "Guardar gasto"}
            </button>
          </form>
        </article>

        <aside className="panel expense-breakdown-panel">
          <div className="panel-header">
            <div>
              <h3>Resumen de tienda</h3>
              <p>Vista rápida de dónde se fue la plata de la tienda en todo el historial.</p>
            </div>
          </div>

          <div className="expense-breakdown-list">
            {categoryTotals.map((item) => (
              <div className="expense-breakdown-row" key={item.category}>
                <div>
                  <strong>{item.category}</strong>
                  <span>{Math.round((item.total / Math.max(1, businessExpensesTotal)) * 100)}%</span>
                </div>
                <div className="expense-progress-track">
                  <span style={{ width: `${Math.min(100, (item.total / Math.max(1, businessExpensesTotal)) * 100)}%` }} />
                </div>
                <small>{formatCurrency(item.total)}</small>
              </div>
            ))}

            {!categoryTotals.length ? (
              <div className="empty-state compact-empty">
                <strong>Sin gastos de tienda</strong>
                <p>Cuando registres compras del negocio aparecerá el resumen por categoría.</p>
              </div>
            ) : null}
          </div>
        </aside>
      </div>

      <article className="panel expense-history-panel">
        <div className="orders-toolbar">
          <div className="panel-header compact-panel-header">
            <div>
              <h3>Historial de gastos</h3>
              <p>Filtra por tienda o personal y elimina registros si te equivocas.</p>
            </div>
          </div>
          <input
            className="search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar gasto o categoría..."
            type="search"
            value={query}
          />
        </div>

        <div className="segmented-control expense-history-filter">
          {(["Todos", "Tienda", "Personal"] as const).map((item) => (
            <button
              className={filter === item ? "active" : undefined}
              key={item}
              onClick={() => setFilter(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="expense-table">
          {visibleExpenses.map((expense) => (
            <article className="expense-row" key={expense.id}>
              <div>
                <span className="section-kicker">{expenseDateLabel(expense.expenseDate)}</span>
                <strong>{expense.title}</strong>
                <p>{expense.category}{expense.notes ? ` · ${expense.notes}` : ""}</p>
              </div>
              <span className={`badge ${expense.scope === "Tienda" ? "info" : "accent"}`}>{expense.scope}</span>
              <strong>{formatCurrency(expense.amount)}</strong>
              <button className="btn danger" onClick={() => void onDeleteExpense(expense.id)} type="button">
                Eliminar
              </button>
            </article>
          ))}

          {!visibleExpenses.length ? (
            <div className="empty-state order-empty-state">
              <strong>No hay gastos registrados</strong>
              <p>Usa el formulario para empezar a medir costos reales de la tienda.</p>
            </div>
          ) : null}
        </div>
      </article>
    </section>
  );
}
