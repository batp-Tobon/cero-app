"use client";

import * as React from "react";
import { cn } from "@/shared/lib/utils";
import {
  countDigits,
  formatAmountInput,
  formatAmountTyping,
  indexAfterDigits,
  parseAmountInput,
} from "@/shared/lib/format";

/**
 * Campo de importe. Teclado numérico en móvil, separador de miles mientras
 * se escribe y el símbolo fuera del input para que no estorbe al cursor.
 *
 * Agrupar en vivo obliga a recolocar el cursor a mano: al insertar un punto,
 * el texto se alarga y el navegador dejaría el cursor un carácter por detrás,
 * de modo que escribir 1250000 acabaría saliendo desordenado. Se cuenta por
 * dígitos —no por posición— porque los separadores van cambiando de sitio.
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
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? (value ? formatAmountInput(value) : "");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const caret = React.useRef<number | null>(null);

  // Antes de pintar, no después: con `useEffect` el cursor daría un salto
  // visible al final del campo en cada pulsación.
  React.useLayoutEffect(() => {
    const position = caret.current;
    caret.current = null;
    if (position != null) {
      inputRef.current?.setSelectionRange(position, position);
    }
  });

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    const digitsBefore = countDigits(
      raw,
      event.target.selectionStart ?? raw.length,
    );
    const formatted = formatAmountTyping(raw);
    caret.current = indexAfterDigits(formatted, digitsBefore);
    setDraft(formatted);
    onValueChange(parseAmountInput(formatted));
  }

  return (
    <div
      className={cn(
        "flex h-14 min-w-0 max-w-full items-center gap-2 rounded-2xl border border-transparent bg-secondary px-4",
        "transition-[border-color,box-shadow] focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
        disabled && "opacity-50",
        className,
      )}
    >
      <span className="text-lg font-semibold text-muted-foreground" aria-hidden>
        $
      </span>
      <input
        ref={inputRef}
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        placeholder={placeholder}
        value={shown}
        aria-describedby={describedBy}
        onChange={onChange}
        onBlur={() => setDraft(null)}
        className="tabular min-w-0 w-full bg-transparent text-xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
      />
    </div>
  );
}
