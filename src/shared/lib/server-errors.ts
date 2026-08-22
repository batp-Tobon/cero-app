import "server-only";

const SAFE_PREFIXES = [
  "El comprobante ",
  "El contenido del comprobante ",
  "La ruta del comprobante ",
  "No pudimos verificar el comprobante.",
  "El movimiento dejaría ",
];

/** Registra el detalle para observabilidad sin devolver estructura SQL al cliente. */
export function publicActionError(
  context: string,
  error: unknown,
  fallback = "No pudimos completar la operación. Inténtalo nuevamente.",
): string {
  console.error(`[${context}]`, error);
  const message = error instanceof Error ? error.message : "";
  return SAFE_PREFIXES.some((prefix) => message.startsWith(prefix))
    ? message
    : fallback;
}
