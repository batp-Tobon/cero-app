"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/shared/lib/utils";

/**
 * Bottom sheet. En móvil sube desde abajo, que es donde alcanza el pulgar;
 * a partir de `sm` se centra como diálogo.
 */
const Sheet = DialogPrimitive.Root;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-background/80 backdrop-blur-sm",
      "data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, onOpenAutoFocus, ...props }, forwardedRef) => {
  const contentRef = React.useRef<React.ElementRef<
    typeof DialogPrimitive.Content
  > | null>(null);

  React.useImperativeHandle(forwardedRef, () => contentRef.current!);

  React.useEffect(() => {
    const node = contentRef.current;
    const viewport = window.visualViewport;
    if (!node || !viewport) return;

    const updateViewport = () => {
      const keyboardInset = Math.max(
        0,
        window.innerHeight - viewport.height - viewport.offsetTop,
      );
      node.style.setProperty("--sheet-viewport-height", `${viewport.height}px`);
      node.style.setProperty(
        "--sheet-keyboard-inset",
        window.matchMedia("(min-width: 640px)").matches
          ? "auto"
          : `${keyboardInset}px`,
      );
    };

    updateViewport();
    viewport.addEventListener("resize", updateViewport);
    viewport.addEventListener("scroll", updateViewport);
    return () => {
      viewport.removeEventListener("resize", updateViewport);
      viewport.removeEventListener("scroll", updateViewport);
    };
  }, []);

  return (
    <DialogPrimitive.Portal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={contentRef}
        tabIndex={-1}
        className={cn(
          "fixed inset-x-0 z-50 mx-auto w-full max-w-md",
          "overflow-y-auto overscroll-contain rounded-t-3xl bg-popover",
          "px-5 pt-3 shadow-2xl outline-none",
          "data-[state=open]:animate-sheet-up data-[state=closed]:animate-sheet-down",
          "sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-3xl",
          className,
        )}
        style={{
          bottom: "var(--sheet-keyboard-inset, 0px)",
          maxHeight:
            "calc(var(--sheet-viewport-height, 100dvh) - max(env(safe-area-inset-top, 0px), 0.75rem))",
          paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1.5rem)",
          scrollPaddingTop: "1rem",
          scrollPaddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 1rem)",
          ...style,
        }}
        onOpenAutoFocus={(event) => {
          if (onOpenAutoFocus) {
            onOpenAutoFocus(event);
            if (event.defaultPrevented) return;
          }
          event.preventDefault();
          requestAnimationFrame(() => contentRef.current?.focus({ preventScroll: true }));
        }}
        {...props}
      >
        <div className="sticky top-0 z-20 -mx-5 -mt-3 mb-4 bg-popover/95 px-5 pt-3 backdrop-blur">
          <div
            aria-hidden
            className="mx-auto h-1 w-10 rounded-full bg-accent sm:hidden"
          />
          <DialogPrimitive.Close
            className="absolute right-3 top-2 rounded-full p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
SheetContent.displayName = DialogPrimitive.Content.displayName;

function SheetHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-5 space-y-1 pr-10", className)} {...props} />;
}

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold tracking-tight", className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
};
