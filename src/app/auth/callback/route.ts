import { NextResponse } from "next/server";
import { createClient } from "@/infrastructure/supabase/server";
import { isPasswordRecoveryDestination } from "@/features/auth/callback";
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
    if (!error) {
      // Recuperación necesita conservar la sesión temporal para cambiar la
      // contraseña. La confirmación de alta, en cambio, termina en login: así
      // el usuario ve que su correo fue validado y entra conscientemente con
      // sus credenciales, sin quedar autenticado sólo por abrir el enlace.
      if (isPasswordRecoveryDestination(next)) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      await supabase.auth.signOut({ scope: "local" });
      return NextResponse.redirect(`${origin}/login?motivo=confirmado`);
    }
  }

  return NextResponse.redirect(`${origin}/login?motivo=enlace`);
}
