"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Lock, Mail, UserRound } from "lucide-react";
import { createClient } from "@/infrastructure/supabase/client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { InlineNotice } from "@/shared/components/states";
import { env, isSupabaseConfigured } from "@/shared/lib/env";

const MIN_PASSWORD = 8;

function registerErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ese correo ya tiene una cuenta. Inicia sesión.";
  if (m.includes("password")) return `La contraseña no cumple los requisitos.`;
  if (m.includes("rate limit") || m.includes("too many"))
    return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "Sin conexión con el servidor. Revisa tu red.";
  return "No pudimos crear la cuenta. Inténtalo de nuevo.";
}

export function RegisterForm() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const confirmationRedirect = `${env.appUrl}/auth/callback?next=${encodeURIComponent(
    "/suscripcion?bienvenida=1",
  )}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      setError("Supabase no está configurado.");
      return;
    }
    if (password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim() },
        emailRedirectTo: confirmationRedirect,
      },
    });

    if (authError) {
      setError(registerErrorMessage(authError.message));
      setLoading(false);
      return;
    }

    // Una alta segura no debe dejar una sesión local abierta antes de que el
    // flujo de confirmación haya terminado. Esto contiene una configuración
    // remota incorrecta y evita el acceso automático desde este formulario.
    if (data.session) {
      await supabase.auth.signOut({ scope: "local" });
      setError(
        "No pudimos exigir la confirmación del correo. La cuenta no quedó abierta; inténtalo más tarde.",
      );
      setLoading(false);
      return;
    }

    setCheckEmail(true);
    setLoading(false);
  }

  async function resendConfirmation() {
    setResending(true);
    setResendMessage(null);

    const supabase = createClient();
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: confirmationRedirect },
    });

    setResendMessage(
      resendError
        ? registerErrorMessage(resendError.message)
        : "Correo reenviado. Revisa también Spam o Promociones.",
    );
    setResending(false);
  }

  if (checkEmail) {
    return (
      <div className="space-y-6 text-center">
        <div className="space-y-2">
          <h2 className="title-section">Confirma tu correo</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Te enviamos un enlace a{" "}
            <span className="text-foreground">{email}</span>. Ábrelo para
            activar tu cuenta y entrar en CERO.
          </p>
        </div>
        {resendMessage && <InlineNotice>{resendMessage}</InlineNotice>}
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          onClick={resendConfirmation}
          disabled={resending}
        >
          {resending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Reenviar correo
        </Button>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/login">Volver a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <InlineNotice variant="danger">{error}</InlineNotice>}

      <div className="space-y-1.5">
        <Label htmlFor="fullName">Nombre</Label>
        <div className="relative">
          <UserRound
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="fullName"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Tu nombre"
            autoComplete="name"
            maxLength={80}
            required
            disabled={loading}
            className="pl-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@email.com"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            disabled={loading}
            className="pl-11"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            disabled={loading}
            className="pl-11"
            aria-describedby="password-hint"
          />
        </div>
        <p id="password-hint" className="text-xs text-muted-foreground">
          Mínimo {MIN_PASSWORD} caracteres.
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Creando cuenta…
          </>
        ) : (
          <>
            Crear cuenta
            <ArrowRight className="h-4 w-4" aria-hidden />
          </>
        )}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Inicia sesión
        </Link>
      </p>
    </form>
  );
}
