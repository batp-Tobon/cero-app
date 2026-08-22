import Link from "next/link";
import { ArrowRight, BrainCircuit, LockKeyhole } from "lucide-react";

export function AiEntryCard({ enabled }: { enabled: boolean }) {
  return (
    <Link
      href="/ia"
      className="mt-7 flex items-center gap-3 rounded-3xl border border-primary/20 bg-gradient-to-br from-card to-primary/10 p-4 transition-colors hover:border-primary/40"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        {enabled ? (
          <BrainCircuit className="h-5 w-5" aria-hidden />
        ) : (
          <LockKeyhole className="h-5 w-5" aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">CERO Inteligente</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {enabled
            ? "Analiza tu flujo y tus deudas sin enviar datos a terceros."
            : "Disponible durante la prueba y con CERO Pro."}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-primary" aria-hidden />
    </Link>
  );
}
