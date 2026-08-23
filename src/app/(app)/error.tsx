"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/shared/ui/button";

/** Frontera segura: el detalle real queda en logs y el digest permite rastrearlo. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center"
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      </span>

      <h1 className="mt-5 title-section">Algo falló al cargar</h1>
      <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
        No pudimos completar la operación. Revisa tu conexión y vuelve a intentarlo.
      </p>
      {error.digest && (
        <p className="mt-2 text-xs text-muted-foreground/70">
          Referencia: {error.digest}
        </p>
      )}

      <Button onClick={reset} className="mt-7">
        <RotateCcw className="h-4 w-4" aria-hidden />
        Reintentar
      </Button>
    </div>
  );
}
