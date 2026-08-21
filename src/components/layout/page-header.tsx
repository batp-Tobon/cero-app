import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Cabecera de pantalla. `backHref` en vez de `router.back()`: al abrir un
 * crédito desde una notificación el historial puede estar vacío y la flecha
 * se quedaría muerta.
 */
export function PageHeader({
  title,
  subtitle,
  backHref,
  action,
  centered = false,
  className,
}: {
  title: string;
  subtitle?: string;
  backHref?: string;
  action?: React.ReactNode;
  centered?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn("flex items-center gap-3 pt-safe", className)}
      // La cabecera no es fija: en móvil el scroll debe devolver toda la
      // pantalla al contenido.
    >
      {backHref && (
        <Link
          href={backHref}
          aria-label="Volver"
          className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
      )}

      <div className={cn("min-w-0 flex-1", centered && "text-center")}>
        <h1 className="truncate text-base font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>

      {action ? (
        <div className="shrink-0">{action}</div>
      ) : (
        // Contrapeso de la flecha para que el título centrado quede centrado.
        centered && backHref && <span className="h-10 w-10 shrink-0" />
      )}
    </header>
  );
}
