import { AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Card, CardEyebrow } from "@/components/ui/card";
import { formatCompactMoney, formatMoney, formatPercent } from "@/lib/format";
import type { DebtOverview } from "@/types/domain";

/**
 * Consolidado de toda la deuda: cuánto debo, cuánto he pagado y cuánto he
 * avanzado. Va centrado y en tarjeta, como el resto del inicio: es la cifra
 * que manda, y separarla del fondo la convierte en el ancla de la pantalla.
 */
export function DebtSummary({ overview }: { overview: DebtOverview }) {
  const {
    totalDebt,
    totalPrincipal,
    totalPrincipalPaid,
    progressPercent,
    overdueCount,
    revolvingDebt,
    creditDebt,
    currency,
  } = overview;

  return (
    <Card asChild className="mt-4 px-5 py-7">
      <section aria-labelledby="debt-total">
        <CardEyebrow id="debt-total" className="text-center">
          Deuda total
        </CardEyebrow>

        <p className="tabular mt-3 text-center text-[2.6rem] font-bold leading-none tracking-tight">
          {formatMoney(totalDebt, currency)}
        </p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          deuda pendiente
        </p>

        <div className="mt-7 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold text-primary">
              {formatPercent(progressPercent)} pagado
            </p>
            <p className="tabular text-xs text-muted-foreground">
              de {formatCompactMoney(totalPrincipal, currency)} en créditos
            </p>
          </div>

          <Progress
            value={progressPercent}
            aria-label={`${formatPercent(progressPercent)} de la deuda pagada`}
          />

          <p className="tabular text-xs text-muted-foreground">
            {formatMoney(totalPrincipalPaid, currency)} pagados
          </p>
        </div>

        {/* El desglose sólo aparece cuando hay más de una clase de deuda:
            con un único crédito repetiría la cifra grande. */}
        {revolvingDebt > 0 && creditDebt > 0 && (
          <dl className="mt-6 grid grid-cols-2 gap-2.5 border-t border-border pt-5">
            <div className="text-center">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Créditos
              </dt>
              <dd className="tabular mt-1 text-sm font-semibold">
                {formatMoney(creditDebt, currency)}
              </dd>
            </div>
            <div className="text-center">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Tarjetas
              </dt>
              <dd className="tabular mt-1 text-sm font-semibold">
                {formatMoney(revolvingDebt, currency)}
              </dd>
            </div>
          </dl>
        )}

        {overdueCount > 0 && (
          <p className="mt-6 flex items-center justify-center gap-2 rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
            {overdueCount === 1
              ? "Tienes 1 cuota vencida."
              : `Tienes ${overdueCount} cuotas vencidas.`}
          </p>
        )}
      </section>
    </Card>
  );
}
