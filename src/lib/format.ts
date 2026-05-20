import type { MonthKey } from "@/types";

export function formatCurrency(value: number) {
  return `${value.toLocaleString("es-BO")} Bs`;
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function badgeClass(value: string) {
  const text = value.toLowerCase();

  if (
    text.includes("completo") ||
    text.includes("lista") ||
    text.includes("ok") ||
    text.includes("activo") ||
    text.includes("registrado")
  ) {
    return "success";
  }

  if (
    text.includes("pendiente") ||
    text.includes("esperando") ||
    text.includes("50%") ||
    text.includes("preparación")
  ) {
    return "warning";
  }

  if (text.includes("cancelado") || text.includes("bajo") || text.includes("falta")) {
    return "danger";
  }

  return "info";
}

export const months: MonthKey[] = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre"
];
