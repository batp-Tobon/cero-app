import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/shared/lib/utils";

/**
 * Superficie base. Sin sombras ni bordes marcados: la jerarquia la da el
 * color de fondo, no una caja dibujada.
 */
const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }
>(({ className, asChild = false, ...props }, ref) => {
  // `asChild` deja que un <section> con su aria-labelledby conserve la
  // semantica y tome el aspecto de tarjeta, sin envolverlo en un div de mas.
  const Comp = asChild ? Slot : "div";
  return (
    <Comp
      ref={ref}
      className={cn("rounded-3xl bg-card p-5 text-card-foreground", className)}
      {...props}
    />
  );
});
Card.displayName = "Card";

/** Rotulo en versalitas de las secciones: DEUDA TOTAL, PROXIMO PAGO... */
const CardEyebrow = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn(
      "eyebrow",
      className,
    )}
    {...props}
  />
));
CardEyebrow.displayName = "CardEyebrow";

export { Card, CardEyebrow };
