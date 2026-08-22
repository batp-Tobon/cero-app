const FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/;

/**
 * Celda RFC 4180 segura para Excel. El apóstrofo impide que contenido escrito
 * por un usuario se ejecute como fórmula al abrir la exportación.
 */
export function csvCell(value: unknown): string {
  if (value == null) return "";
  const raw = String(value);
  const text = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return /[",;\n\r]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/** CSV UTF-8 separado por punto y coma, compatible con Excel en español. */
export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [
    headers.map(csvCell).join(";"),
    ...rows.map((row) => row.map(csvCell).join(";")),
  ];
  return `\uFEFF${lines.join("\r\n")}`;
}
