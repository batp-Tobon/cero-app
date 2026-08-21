/**
 * Acceso centralizado a las variables de entorno.
 * Sólo se exponen al cliente las que llevan prefijo NEXT_PUBLIC_.
 * Nunca importar aquí claves de servicio ni secretos.
 */

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  defaultCurrency: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY ?? "COP",
};

/** La app arranca sin Supabase configurado, pero el login avisa en vez de fallar. */
export const isSupabaseConfigured = (): boolean =>
  Boolean(env.supabaseUrl && env.supabaseAnonKey);
