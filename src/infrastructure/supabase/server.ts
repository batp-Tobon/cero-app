import { cache } from "react";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database, ProfileRow } from "@/shared/types/database";
import { env, isSupabaseConfigured } from "@/shared/lib/env";

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

/** Lo unico que la app necesita saber de quien esta dentro. */
type SessionUser = { id: string; email: string | null };

/**
 * Usuario autenticado (o null), deduplicado por request.
 *
 * Usa `getClaims()`, que VERIFICA LA FIRMA del token en local contra la clave
 * publica del proyecto: 0,4 ms frente a los ~214 ms que costaba `getUser()`,
 * que va por red en cada pagina.
 *
 * El middleware utiliza la misma verificación firmada. Una revocación remota
 * se refleja al expirar el JWT; el cierre de sesión local borra las cookies.
 *
 * Y aunque llegara: las RLS filtran por `auth.uid()` en Postgres, asi que un
 * token invalido no devuelve datos de nadie.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (error || !sub) return null;

  const email = data.claims.email;
  return { id: sub, email: typeof email === "string" ? email : null };
});

/** Perfil del usuario actual (o null), deduplicado por request. */
export const getCurrentProfile = cache(async (): Promise<ProfileRow | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
});
