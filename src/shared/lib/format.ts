/**
 * Formato de dinero y tasas. Un solo sitio: si mañana cambia la moneda,
 * cambia aquí y no en veinte pantallas.
 */

import { env } from "@/shared/lib/env";

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

/**
 * Separadores de es-CO leídos de Intl y no escritos a mano: el grupo es "."
 * y el decimal ",", justo al revés que en inglés, y equivocarse convierte
 * 1.250 en mil doscientos cincuenta o en uno con veinticinco.
 */
const SEPARATORS = (() => {
  const parts = new Intl.NumberFormat(LOCALE).formatToParts(12345.6);
  return {
    group: parts.find((part) => part.type === "group")?.value ?? ".",
    decimal: parts.find((part) => part.type === "decimal")?.value ?? ",",
  };
})();

/** Cuántos dígitos hay hasta `position`; sirve para recolocar el cursor. */
export function countDigits(text: string, position: number): number {
  let digits = 0;
  for (let i = 0; i < position && i < text.length; i += 1) {
    if (text[i] >= "0" && text[i] <= "9") digits += 1;
  }
  return digits;
}

/** Posición justo después del dígito número `count`; el inverso de `countDigits`. */
export function indexAfterDigits(text: string, count: number): number {
  if (count <= 0) return 0;
  let digits = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] >= "0" && text[i] <= "9") {
      digits += 1;
      if (digits === count) return i + 1;
    }
  }
  return text.length;
}

/**
 * Da forma a un importe MIENTRAS se escribe: "1250000" pasa a "1.250.000".
 *
 * No usa `Intl.NumberFormat` sobre el número porque hay estados intermedios
 * que no son un número todavía y hay que respetar: una coma recién tecleada
 * ("1.250,") o un cero decimal a la derecha ("1.250,50") desaparecerían al
 * convertir a número y volver, y el campo borraría lo que la persona acaba
 * de pulsar.
 */
export function formatAmountTyping(raw: string): string {
  // Se quitan primero los separadores de miles: la función se ejecuta en cada
  // pulsación sobre el contenido YA formateado del campo, y tomar ese "." por
  // un decimal convertiría 1.250 en 1,25 a la segunda tecla.
  const cleaned = raw.split(SEPARATORS.group).join("");
  const firstDecimal = cleaned.indexOf(SEPARATORS.decimal);
  const digitsOnly = (value: string) => value.replace(/\D/g, "");

  const whole = digitsOnly(
    firstDecimal === -1 ? cleaned : cleaned.slice(0, firstDecimal),
  ).replace(/^0+(?=\d)/, "");
  const fraction =
    firstDecimal === -1
      ? null
      : digitsOnly(cleaned.slice(firstDecimal + 1)).slice(0, 2);

  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATORS.group);
  if (fraction === null) return grouped;
  return `${grouped || "0"}${SEPARATORS.decimal}${fraction}`;
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
