import { cn } from "@/shared/lib/utils";

/**
 * Marca de CERO: un anillo que se cierra. Nada más — el nombre es el logotipo.
 */
export function CeroMark({
  className,
  size = 44,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-secondary",
        className,
      )}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        style={{ width: size * 0.5, height: size * 0.5 }}
      >
        <circle
          cx="12"
          cy="12"
          r="8"
          stroke="hsl(var(--primary))"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="44 6"
          transform="rotate(-90 12 12)"
        />
      </svg>
    </span>
  );
}

/** Logotipo completo, centrado. Se usa en login y recuperación. */
export function CeroWordmark({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col items-center", className)}>
      <CeroMark size={56} />
      <h1 className="mt-5 text-4xl font-bold tracking-[0.18em] text-foreground">
        CERO
      </h1>
    </div>
  );
}
