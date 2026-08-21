import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { CardEyebrow } from "@/components/ui/card";
import {
  formatCompactMoney,
  formatMoney,
  formatPercent,
} from "@/lib/format";
import type { DebtOverview } from "@/types/domain";

/**
 * Cabecera del inicio: cuánto debo, cuánto he pagado y cuánto he avanzado.
 * Es lo primero que se ve, así que sólo lleva esas tres respuestas.
 */
export function DebtSummary({ overview }: { overview: DebtOverview }) {
  const {
    totalDebt,
    totalPrincipal,
    totalPrincipalPaid,
    progressPercent,
    overdueCount,
    revolvingDebt,
    currency,
  } = overview;

  return (
    <section aria-labelledby="debt-total" className="pt-2">
      <CardEyebrow id="debt-total">Deuda total</CardEyebrow>

      <p className="tabular mt-2 text-[2.6rem] font-bold leading-none tracking-tight">
        {formatMoney(totalDebt, currency)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        deuda pendiente
        {revolvingDebt > 0 && (
          <>
            {" · incluye "}
            <span className="tabular">
              {formatMoney(revolvingDebt, currency)}
            </span>{" "}
            en tarjetas
          </>
        )}
      </p>

      <div className="mt-6 space-y-2">
        <p className="text-sm font-semibold text-primary">
          {formatPercent(progressPercent)} pagado
        </p>
        <Progress
          value={progressPercent}
          aria-label={`${formatPercent(progressPercent)} de la deuda pagada`}
        />
        <p className="tabular text-xs text-muted-foreground">
          {formatMoney(totalPrincipalPaid, currency)} pagados de{" "}
          {formatCompactMoney(totalPrincipal, currency)} en créditos
        </p>
      </div>

      {overdueCount > 0 && (
        <p className="mt-5 flex items-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {overdueCount === 1
            ? "Tienes 1 cuota vencida."
            : `Tienes ${overdueCount} cuotas vencidas.`}
        </p>
      )}
    </section>
  );
}
