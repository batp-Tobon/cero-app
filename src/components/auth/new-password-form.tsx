"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/infrastructure/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { InlineNotice } from "@/components/common/states";

const MIN_LENGTH = 8;

export function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_LENGTH) {
      setError(`La contraseña debe tener al menos ${MIN_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError("Las dos contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.updateUser({ password });

    if (authError) {
      setLoading(false);
      setError(
        authError.message.toLowerCase().includes("session")
          ? "El enlace caducó. Pide uno nuevo desde ¿Olvidaste tu contraseña?"
          : "No pudimos actualizar la contraseña. Inténtalo de nuevo.",
      );
      return;
    }

    toast.success("Contraseña actualizada");
    router.replace("/inicio");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Elige una contraseña nueva para tu cuenta.
      </p>

      {error && <InlineNotice variant="danger">{error}</InlineNotice>}

      <div className="space-y-1.5">
        <Label htmlFor="password">Nueva contraseña</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          minLength={MIN_LENGTH}
          required
          disabled={loading}
          aria-describedby="password-hint"
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          Mínimo {MIN_LENGTH} caracteres.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">Repite la contraseña</Label>
        <Input
          id="confirm"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="••••••••"
          autoComplete="new-password"
          required
          disabled={loading}
        />
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Guardar contraseña
      </Button>
    </form>
  );
}
