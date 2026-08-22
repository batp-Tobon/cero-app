"use client";

import { Check } from "lucide-react";
import {
  ACCENT_COLORS,
  PRODUCT_ICONS,
  accent,
  type AccentColor,
  type IconName,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * Elige color e icono del producto. Se muestra una vista previa real —
 * el mismo círculo que verá en el inicio — para no tener que imaginárselo.
 */
export function AppearancePicker({
  color,
  icon,
  onColorChange,
  onIconChange,
  disabled,
}: {
  color: AccentColor;
  icon: IconName | null;
  onColorChange: (color: AccentColor) => void;
  onIconChange: (icon: IconName) => void;
  disabled?: boolean;
}) {
  const classes = accent(color);

  return (
    <div className="space-y-4">
      <fieldset>
        <legend className="mb-2 text-sm font-medium leading-none text-muted-foreground">
          Color
        </legend>
        <div className="flex flex-wrap gap-2.5">
          {ACCENT_COLORS.map((option) => {
            const active = option.value === color;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={option.label}
                title={option.label}
                disabled={disabled}
                onClick={() => onColorChange(option.value)}
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-full transition-transform",
                  option.classes.swatch,
                  active
                    ? "ring-2 ring-foreground ring-offset-2 ring-offset-card"
                    : "hover:scale-105",
                  disabled && "opacity-50",
                )}
              >
                {active && (
                  <Check
                    className="h-4 w-4 text-background"
                    strokeWidth={3}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium leading-none text-muted-foreground">
          Icono
        </legend>
        <div className="grid grid-cols-6 gap-2">
          {PRODUCT_ICONS.map((option) => {
            const Icon = option.icon;
            const active = option.value === icon;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={option.label}
                title={option.label}
                disabled={disabled}
                onClick={() => onIconChange(option.value)}
                className={cn(
                  "flex h-11 items-center justify-center rounded-xl border transition-colors",
                  active
                    ? cn("border-transparent", classes.chip, classes.text)
                    : "border-border bg-secondary text-muted-foreground hover:bg-accent",
                  disabled && "opacity-50",
                )}
              >
                <Icon className="h-4 w-4" aria-hidden />
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}
