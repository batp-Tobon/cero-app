/**
 * Formato de dinero y tasas. Un solo sitio: si mañana cambia la moneda,
 * cambia aquí y no en veinte pantallas.
 */

import { env } from "@/lib/env";

const LOCALE = "es-CO";

/** Monedas que no usan decimales en el día a día. */
const NO_DECIMAL_CURRENCIES = new Set(["COP", "CLP", "JPY", "KRW", "PYG"]);

function fractionDigits(currency: string): number {
  return NO_DECIMAL_CURRENCIES.has(currency) ? 0 : 2;
}

/** "$238.542.240" — el símbolo pegado, como en el diseño. */
export function formatMoney(
  value: number | null | undefined,
  currency: string = env.defaultCurrency,
): string {
  const n = Number(value ?? 0);
  const digits = fractionDigits(currency);
  const body = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Math.abs(n));
  return `${n < 0 ? "−" : ""}$${body}`;
}

/** "$243M" — para textos secundarios donde el dígito exacto estorba. */
export function formatCompactMoney(
  value: number | null | undefined,
  currency: string = env.defaultCurrency,
): string {
  const n = Math.abs(Number(value ?? 0));
  if (n < 1_000_000) return formatMoney(value, currency);
  const units: Array<[number, string]> = [
    [1_000_000_000_000, "B"],
    [1_000_000_000, "MM"],
    [1_000_000, "M"],
  ];
  for (const [factor, suffix] of units) {
    if (n >= factor) {
      const scaled = n / factor;
      const text = new Intl.NumberFormat(LOCALE, {
        maximumFractionDigits: scaled < 10 ? 1 : 0,
      }).format(scaled);
      return `$${text}${suffix}`;
    }
  }
  return formatMoney(value, currency);
}

/** Sólo el número, sin símbolo — para inputs de importe. */
export function formatAmountInput(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(
    value,
  );
}

/** Lee un importe escrito por el usuario ("1.250.000" o "1250000,50"). */
export function parseAmountInput(raw: string): number {
  const cleaned = raw.replace(/[^\d,.-]/g, "");
  // es-CO: el punto separa miles y la coma decimales.
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : 0;
}

/** "1,89% m.v." a partir de la tasa decimal 0.0189. */
export function formatRate(rate: number | null | undefined): string {
  const pct = Number(rate ?? 0) * 100;
  const text = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(pct);
  return `${text}% m.v.`;
}

/** "1,7%" para la barra de progreso. */
export function formatPercent(value: number, decimals = 1): string {
  return `${new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(value)}%`;
}
