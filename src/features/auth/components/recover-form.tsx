"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/infrastructure/supabase/client";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { InlineNotice } from "@/shared/components/states";
import { env, isSupabaseConfigured } from "@/shared/lib/env";

export function RecoverForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isSupabaseConfigured()) {
      setError("Supabase no está configurado.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${env.appUrl}/auth/callback?next=/nueva-contrasena` },
    );
    setLoading(false);

    // No se distingue entre correo existente y no existente: revelarlo
    // permitiría averiguar quién tiene cuenta.
    if (authError && !authError.message.toLowerCase().includes("rate")) {
      setError("No pudimos enviar el correo. Inténtalo de nuevo.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
          <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
        </span>
        <div className="space-y-2">
          <h2 className="text-base font-semibold">Revisa tu correo</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Si <span className="text-foreground">{email}</span> tiene una cuenta
            en CERO, le enviamos un enlace para crear una contraseña nueva.
          </p>
        </div>
        <Button asChild variant="secondary" className="w-full">
          <Link href="/login">Volver a iniciar sesión</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Escribe tu correo y te enviamos un enlace para restablecer la
        contraseña.
      </p>

      {error && <InlineNotice variant="danger">{error}</InlineNotice>}

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="tu@email.com"
          autoComplete="email"
          autoCapitalize="none"
          required
          disabled={loading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Enviar enlace
      </Button>

      <Button asChild variant="ghost" className="w-full">
        <Link href="/login">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Volver
        </Link>
      </Button>
    </form>
  );
}
