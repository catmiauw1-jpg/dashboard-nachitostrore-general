export interface DeliveryEstimate {
  from: Date;
  to: Date;
  label: string;
  sortTime: number;
}

function cloneAtNoon(date: Date) {
  const next = new Date(date);
  next.setHours(12, 0, 0, 0);
  return next;
}

function isBusinessDay(date: Date) {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

export function addBusinessDays(value: string | Date, days: number) {
  const date = typeof value === "string" ? new Date(value) : new Date(value);
  const next = cloneAtNoon(date);
  let added = 0;

  while (added < days) {
    next.setDate(next.getDate() + 1);
    if (isBusinessDay(next)) added += 1;
  }

  return next;
}

export function estimateBusinessDelivery(value?: string, minDays = 2, maxDays = 4): DeliveryEstimate | null {
  if (!value) return null;
  const createdAt = new Date(value);
  if (Number.isNaN(createdAt.getTime())) return null;

  const from = addBusinessDays(createdAt, minDays);
  const to = addBusinessDays(createdAt, maxDays);
  const sameMonth = from.getMonth() === to.getMonth() && from.getFullYear() === to.getFullYear();
  const formatter = new Intl.DateTimeFormat("es-BO", { day: "numeric", month: "short" });

  return {
    from,
    to,
    label: sameMonth ? `${from.getDate()} - ${formatter.format(to)}` : `${formatter.format(from)} - ${formatter.format(to)}`,
    sortTime: from.getTime()
  };
}
