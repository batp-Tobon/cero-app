import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database, ProfileRow } from "@/types/database";
import { env } from "@/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Cliente de Supabase para Server Components, Route Handlers y Server Actions.
 * En Next 15 `cookies()` es asincrono.
 *
 * Envuelto en `cache()`: dentro de un mismo request se reutiliza el cliente en
 * vez de releer las cookies en cada llamada.
 */
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Llamado desde un Server Component: el middleware refresca la sesion.
        }
      },
    },
  });
});

/** Usuario autenticado (o null), deduplicado por request. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Perfil del usuario actual (o null), deduplicado por request. */
export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});
