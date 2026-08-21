"use client";

import { Toaster as Sonner } from "sonner";

/** Avisos de la app, con los colores del tema. */
export function Toaster() {
  return (
    <Sonner
      position="top-center"
      theme="dark"
      richColors={false}
      toastOptions={{
        classNames: {
          toast:
            "group rounded-2xl border border-border bg-popover text-foreground shadow-lg",
          description: "text-muted-foreground",
          actionButton: "bg-primary text-primary-foreground",
          cancelButton: "bg-secondary text-muted-foreground",
          error: "border-destructive/40",
          success: "border-primary/40",
        },
      }}
    />
  );
}
