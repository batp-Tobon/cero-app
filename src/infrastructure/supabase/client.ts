"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/shared/types/database";
import { env } from "@/shared/lib/env";

/** Cliente de Supabase para componentes de cliente (navegador). */
export function createClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
