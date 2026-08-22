import { accent } from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * Círculo del producto, con su color y su icono.
 *
 * Deliberadamente SIN "use client": es puro marcado, sin estado ni eventos, y
 * lo pintan Server Components que le pasan el icono como componente. Un
 * componente de cliente no podría recibirlo — React no sabe serializar una
 * función a través de esa frontera.
 */
export function ProductBadge({
  icon: Icon,
  color,
  size = "md",
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const classes = accent(color);

  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        size === "sm" && "h-9 w-9",
        size === "md" && "h-10 w-10",
        size === "lg" && "h-14 w-14",
        classes.chip,
        className,
      )}
    >
      <Icon className={cn(size === "lg" ? "h-6 w-6" : "h-4 w-4", classes.text)} />
    </span>
  );
}
