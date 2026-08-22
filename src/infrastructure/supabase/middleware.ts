import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/shared/types/database";
import { env, isSupabaseConfigured } from "@/shared/lib/env";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PROTECTED_PREFIXES = [
  "/inicio",
  "/tarjetas",
  "/admin",
  "/creditos",
  "/presupuesto",
  "/actividad",
  "/ia",
  "/perfil",
  "/suscripcion",
  "/api/export",
];
const AUTH_PAGES = [
  "/login",
  "/registro",
  "/recuperar",
  "/nueva-contrasena",
];

/**
 * Refresca la sesion de Supabase en cada request y protege las rutas privadas.
 * Si Supabase todavia no esta configurado deja pasar, para que la app compile.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) return response;

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));
  const isAuthPage = AUTH_PAGES.some((p) => path.startsWith(p));

  // El resto de rutas no necesita tocar Auth. Esto también evita trabajo
  // innecesario en webhooks, páginas públicas y respuestas de infraestructura.
  if (!isProtected && !isAuthPage) return response;

  const supabase = createServerClient<Database>(
    env.supabaseUrl,
    env.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Verifica firma y expiración localmente con JWKS cacheado. A diferencia de
  // getUser(), no hace una petición de red por cada cambio de pantalla.
  const { data, error } = await supabase.auth.getClaims();
  const user = !error && data?.claims?.sub ? data.claims : null;

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirect", path);
    url.searchParams.set("motivo", "sesion");
    return NextResponse.redirect(url);
  }

  // La pantalla de nueva contrasena se abre CON sesion (enlace del correo),
  // asi que no se expulsa al usuario de ahi.
  if (user && isAuthPage && !path.startsWith("/nueva-contrasena")) {
    const url = request.nextUrl.clone();
    url.pathname = "/inicio";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
