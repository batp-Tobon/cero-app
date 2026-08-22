import Link from "next/link";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { cn } from "@/shared/lib/utils";

/**
 * Estado vacío. No es un error: es una pantalla que todavía no tiene datos,
 * así que siempre ofrece la acción que la llena.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      </span>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      <p className="mt-2 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {actionLabel && actionHref && (
        <Button asChild className="mt-6">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      )}
    </div>
  );
}

/**
 * Estado de error. Los detalles técnicos sólo aparecen en desarrollo: una
 * respuesta de Postgres puede revelar nombres de tablas o restricciones.
 */
export function ErrorState({
  title = "No pudimos cargar la información",
  detail,
  className,
}: {
  title?: string;
  detail?: string;
  className?: string;
}) {
  const visibleDetail = process.env.NODE_ENV !== "production" ? detail : undefined;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center px-6 py-14 text-center",
        className,
      )}
    >
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/15">
        <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden />
      </span>
      <h3 className="mt-5 text-base font-semibold">{title}</h3>
      {visibleDetail ? (
        <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
          {visibleDetail}
        </p>
      ) : (
        <p className="mt-2 max-w-[38ch] text-sm leading-relaxed text-muted-foreground">
          Revisa tu conexión e inténtalo nuevamente.
        </p>
      )}
    </div>
  );
}

/** Aviso corto dentro de un formulario o una tarjeta. */
export function InlineNotice({
  children,
  variant = "muted",
}: {
  children: React.ReactNode;
  variant?: "muted" | "warning" | "danger";
}) {
  return (
    <p
      role={variant === "danger" ? "alert" : undefined}
      className={cn(
        "rounded-2xl px-4 py-3 text-sm leading-relaxed",
        variant === "muted" && "bg-secondary text-muted-foreground",
        variant === "warning" && "bg-warning/10 text-warning",
        variant === "danger" && "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </p>
  );
}
