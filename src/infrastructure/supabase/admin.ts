import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/shared/types/database";
import { env } from "@/shared/lib/env";

/**
 * Cliente privilegiado exclusivo de webhooks y acciones ya autenticadas.
 * Nunca se importa desde componentes del navegador ni se reutiliza para reads
 * normales: esas deben seguir pasando por RLS.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role is not configured.");
  }

  return createSupabaseClient<Database>(env.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
