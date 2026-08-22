import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Combina clases de Tailwind resolviendo conflictos. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Inicial(es) para el avatar. */
export function initials(name?: string | null): string {
  if (!name?.trim()) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Primer nombre — el saludo del inicio dice "Buenos días, Albert". */
export function firstName(name?: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** Acota un número a un rango. */
function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Porcentaje 0–100 protegido contra división por cero. */
export function percent(part: number, total: number): number {
  if (!total) return 0;
  return clamp((part / total) * 100, 0, 100);
}
