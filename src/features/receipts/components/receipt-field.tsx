"use client";

import * as React from "react";
import { FileCheck2, FileUp, Paperclip } from "lucide-react";
import { Label } from "@/shared/ui/label";
import { RECEIPT_ACCEPT } from "@/features/receipts/constants";
import { cn } from "@/shared/lib/utils";

export function ReceiptField({
  id,
  disabled,
  existingName,
}: {
  id: string;
  disabled?: boolean;
  existingName?: string | null;
}) {
  const [selectedName, setSelectedName] = React.useState<string | null>(null);

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-center gap-2">
        <Paperclip className="h-4 w-4 text-primary" aria-hidden />
        Comprobante (opcional)
      </Label>
      {existingName && (
        <p className="flex items-center gap-1.5 text-xs text-primary">
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden />
          Guardado: {existingName}
        </p>
      )}
      <label
        htmlFor={id}
        aria-disabled={disabled || undefined}
        className={cn(
          "flex h-12 min-w-0 items-center gap-3 rounded-2xl border border-border bg-secondary px-3",
          "cursor-pointer transition-colors hover:bg-accent",
          "focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <input
          id={id}
          name="receipt"
          type="file"
          accept={RECEIPT_ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={(event) =>
            setSelectedName(event.currentTarget.files?.[0]?.name ?? null)
          }
        />
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
          <FileUp className="h-3.5 w-3.5" aria-hidden />
          Seleccionar
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
          {selectedName ?? "Ningún archivo seleccionado"}
        </span>
      </label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Foto o PDF, máximo 6 MB. Se guarda privado y sólo lo ven quienes tienen
        acceso al producto.
      </p>
    </div>
  );
}
