/**
 * Fechas de la app. Todo se maneja como `YYYY-MM-DD` (fecha civil, sin hora):
 * un vencimiento es un día del calendario, no un instante. Así el servidor
 * (Vercel, en UTC) y el teléfono del usuario coinciden siempre.
 */

const APP_TZ = process.env.NEXT_PUBLIC_APP_TZ ?? "America/Bogota";

export type DateISO = string;

const MONTHS_ES = [
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
  "diciembre",
] as const;

const MONTHS_ES_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

/** Hoy (YYYY-MM-DD) en la zona horaria de la app. */
export function todayISO(): DateISO {
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ }).format(
    new Date(),
  );
}

/** Descompone una fecha ISO sin pasar por `Date` (evita saltos de zona). */
export function parseISO(iso: DateISO): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Suma meses conservando el día de vencimiento. Si el mes destino es más
 * corto, ancla al último día: 31-ene + 1 mes = 28-feb (comportamiento
 * estándar de un crédito, no 3-mar).
 */
export function addMonths(iso: DateISO, months: number): DateISO {
  const { year, month, day } = parseISO(iso);
  const total = year * 12 + (month - 1) + months;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const d = Math.min(day, daysInMonth(y, m));
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Diferencia en días completos entre dos fechas civiles (b - a). */
export function diffDays(a: DateISO, b: DateISO): number {
  const pa = parseISO(a);
  const pb = parseISO(b);
  const ta = Date.UTC(pa.year, pa.month - 1, pa.day);
  const tb = Date.UTC(pb.year, pb.month - 1, pb.day);
  return Math.round((tb - ta) / 86_400_000);
}

/** "01 septiembre 2026" */
export function formatLongDate(iso: DateISO): string {
  const { year, month, day } = parseISO(iso);
  return `${pad(day)} ${MONTHS_ES[month - 1]} ${year}`;
}

/** "01 sep 2026" */
export function formatShortDate(iso: DateISO): string {
  const { year, month, day } = parseISO(iso);
  return `${pad(day)} ${MONTHS_ES_SHORT[month - 1]} ${year}`;
}

/** "01 sep" — para listados densos del mismo año. */
export function formatDayMonth(iso: DateISO): string {
  const { month, day } = parseISO(iso);
  return `${pad(day)} ${MONTHS_ES_SHORT[month - 1]}`;
}

/** "Octubre 2026" — encabezados de la línea de tiempo. */
export function formatMonthTitle(iso: DateISO): string {
  const { year, month } = parseISO(iso);
  const name = MONTHS_ES[month - 1];
  return `${name[0].toUpperCase()}${name.slice(1)} ${year}`;
}

/** "Hoy", "Ayer" o la fecha corta. */
export function formatRelativeDay(iso: DateISO, today = todayISO()): string {
  const d = diffDays(iso, today);
  if (d === 0) return "Hoy";
  if (d === 1) return "Ayer";
  if (d === -1) return "Mañana";
  return formatDayMonth(iso);
}

/** Saludo según la hora local de la app. */
export function greeting(now = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: APP_TZ,
      hour: "2-digit",
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}
