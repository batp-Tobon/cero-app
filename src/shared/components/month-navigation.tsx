import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { addMonths, formatMonthTitle } from "@/shared/lib/dates";

/** Navegación mensual compartida por Presupuesto y Ahorros. */
export function MonthNavigation({
  month,
  basePath,
}: {
  month: string;
  basePath: string;
}) {
  const previous = addMonths(month, -1);
  const next = addMonths(month, 1);

  return (
    <nav
      aria-label="Cambiar mes"
      className="mt-5 flex items-center justify-between rounded-2xl bg-card p-1.5"
    >
      <MonthLink basePath={basePath} month={previous} direction="previous" />
      <span className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="h-4 w-4 text-primary" aria-hidden />
        {formatMonthTitle(month)}
      </span>
      <MonthLink basePath={basePath} month={next} direction="next" />
    </nav>
  );
}

function MonthLink({
  basePath,
  month,
  direction,
}: {
  basePath: string;
  month: string;
  direction: "previous" | "next";
}) {
  const Icon = direction === "previous" ? ChevronLeft : ChevronRight;
  return (
    <Link
      href={`${basePath}?mes=${month}`}
      aria-label={`Ver ${formatMonthTitle(month)}`}
      className="flex h-10 w-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
    >
      <Icon className="h-5 w-5" aria-hidden />
    </Link>
  );
}
