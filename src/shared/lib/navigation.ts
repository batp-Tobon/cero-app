/**
 * Acepta únicamente rutas internas absolutas. Evita que parámetros como
 * `?redirect=https://sitio-malicioso` conviertan el inicio de sesión en un
 * redirector abierto.
 */
export function safeInternalPath(
  value: string | null | undefined,
  fallback = "/inicio",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  // Las barras invertidas se normalizan como separadores en algunos clientes.
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  return value;
}
