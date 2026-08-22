import { CalendarClock, Flag } from "lucide-react";
import { formatMoney } from "@/lib/format";
import { formatMonthTitle, diffDays, todayISO } from "@/lib/dates";

/**
 * Las dos cifras que faltaban en el inicio: qué sale de la cuenta este mes y
 * cuándo se acaba todo esto. La segunda es la promesa de la app —
 * "avanza hacia cero" — puesta en una fecha concreta.
 */
export function MonthSummary({
  monthlyCommitment,
  installmentsDue,
  freeDate,
  currency,
}: {
  monthlyCommitment: number;
  installmentsDue: number;
  freeDate: string | null;
  currency: string;
}) {
  const monthsLeft = freeDate
    ? Math.max(0, Math.round(diffDays(todayISO(), freeDate) / 30.44))
    : null;

  return (
    <dl className="mt-7 grid grid-cols-2 gap-2.5">
      <div className="rounded-2xl bg-card p-4">
        <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          Este mes
        </dt>
        <dd className="tabular mt-1.5 text-lg font-bold leading-none">
          {formatMoney(monthlyCommitment, currency)}
        </dd>
        <p className="mt-1 text-xs text-muted-foreground">
          {/* "pagos" y no "cuotas": aquí entran también los extractos de
              tarjeta, que no son cuotas de nada. */}
          {installmentsDue === 0
            ? "nada pendiente"
            : `${installmentsDue} ${installmentsDue === 1 ? "pago" : "pagos"}`}
        </p>
      </div>

      <div className="rounded-2xl bg-card p-4">
        <dt className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          <Flag className="h-3.5 w-3.5" aria-hidden />
          Libre de deuda
        </dt>
        <dd className="mt-1.5 text-lg font-bold capitalize leading-none text-primary">
          {freeDate ? formatMonthTitle(freeDate) : "—"}
        </dd>
        <p className="mt-1 text-xs text-muted-foreground">
          {monthsLeft == null
            ? "sin créditos activos"
            : monthsLeft >= 24
              ? `en ${Math.floor(monthsLeft / 12)} años`
              : `en ${monthsLeft} meses`}
        </p>
      </div>
    </dl>
  );
}
