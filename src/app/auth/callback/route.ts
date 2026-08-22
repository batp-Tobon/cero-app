import { NextResponse } from "next/server";
import { createClient } from "@/infrastructure/supabase/server";
import { safeInternalPath } from "@/shared/lib/navigation";

/**
 * Canjea el `code` de Supabase Auth por una sesión. Lo usan la confirmación
 * de correo y el enlace de recuperación de contraseña.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeInternalPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?motivo=enlace`);
}
