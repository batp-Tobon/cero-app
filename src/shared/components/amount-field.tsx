"use client";

import * as React from "react";
import { cn } from "@/shared/lib/utils";
import { formatAmountInput, parseAmountInput } from "@/shared/lib/format";

/**
 * Campo de importe. Teclado numérico en móvil, separador de miles mientras
 * se escribe y el símbolo fuera del input para que no estorbe al cursor.
 */
export function AmountField({
  id,
  value,
  onValueChange,
  placeholder = "0",
  disabled,
  autoFocus,
  className,
  "aria-describedby": describedBy,
}: {
  id: string;
  value: number;
  onValueChange: (value: number) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-describedby"?: string;
}) {
  // Texto en edición: mientras el usuario escribe manda lo que teclea, no el
  // número formateado (si no, borrar un dígito reordena el cursor).
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (value ? formatAmountInput(value) : "");

  return (
    <div
      className={cn(
        "flex h-14 items-center gap-2 rounded-2xl border border-transparent bg-secondary px-4",
        "transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
        disabled && "opacity-50",
        className,
      )}
    >
      <span className="text-lg font-semibold text-muted-foreground" aria-hidden>
        $
      </span>
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={shown}
        aria-describedby={describedBy}
        onChange={(e) => {
          setDraft(e.target.value);
          onValueChange(parseAmountInput(e.target.value));
        }}
        onBlur={() => setDraft(null)}
        className="tabular w-full bg-transparent text-xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
