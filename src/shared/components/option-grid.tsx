"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface Option<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  hint?: string;
}

/**
 * Selector en mosaico. Sustituye a un `select` cuando hay pocas opciones y
 * conviene verlas todas: menos toques y área táctil grande.
 */
export function OptionGrid<T extends string>({
  legend,
  options,
  value,
  onChange,
  columns = 2,
  className,
}: {
  legend: string;
  options: ReadonlyArray<Option<T>>;
  value: T | null;
  onChange: (value: T) => void;
  columns?: 1 | 2;
  className?: string;
}) {
  return (
    <fieldset className={className}>
      <legend className="sr-only">{legend}</legend>
      <div
        className={cn(
          "grid gap-2.5",
          columns === 2 ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {options.map(({ value: v, label, icon: Icon, hint }) => {
          const active = v === value;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={cn(
                "flex min-h-[3.5rem] flex-col justify-center gap-1 rounded-2xl border px-4 py-3 text-left transition-colors",
                active
                  ? "border-primary bg-primary/10 text-foreground"
                  : "border-border bg-secondary text-muted-foreground hover:bg-accent",
              )}
            >
              <span className="flex items-center gap-2.5">
                {Icon && (
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      active ? "text-primary" : "text-muted-foreground",
                    )}
                    aria-hidden
                  />
                )}
                <span
                  className={cn(
                    "text-sm font-semibold",
                    active ? "text-foreground" : "text-foreground/90",
                  )}
                >
                  {label}
                </span>
              </span>
              {hint && (
                <span className="text-xs leading-snug text-muted-foreground">
                  {hint}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
