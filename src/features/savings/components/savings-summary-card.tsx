import { Check, Sparkles } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { formatMoney } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { SavingsSnapshot } from "../types";

export function SavingsSummaryCard({
  snapshot,
  historical,
}: {
  snapshot: SavingsSnapshot;
  historical: boolean;
}) {
  const displayedBalance = historical
    ? snapshot.balanceAtMonthEnd
    : snapshot.totalBalance;

  return (
    <section
      aria-labelledby="savings-total-title"
      className="relative mt-5 overflow-hidden rounded-[2rem] bg-card p-5"
    >
      <div
        className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-2xl"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p id="savings-total-title" className="eyebrow">
            {historical ? "Saldo al cierre del mes" : "Total ahorrado"}
          </p>
          {snapshot.automaticSurplus > 0 ? (
            <Badge variant="success">
              <Sparkles className="h-3 w-3" aria-hidden /> Automático
            </Badge>
          ) : snapshot.budgetSaved ? (
            <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <Check className="h-3.5 w-3.5" aria-hidden /> Sincronizado
            </span>
          ) : null}
        </div>

        <p className="figure-hero mt-3 text-primary">
          {formatMoney(displayedBalance, snapshot.currency)}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {!snapshot.budgetSaved
            ? "Guarda el presupuesto de este mes para enviar automáticamente su excedente."
            : snapshot.automaticSurplus > 0
              ? `${formatMoney(snapshot.automaticSurplus, snapshot.currency)} llegaron desde el presupuesto del mes.`
              : "Este mes no tiene excedente disponible para ahorrar automáticamente."}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-border/70 pt-4">
          <SummaryStat
            label="Movimiento del mes"
            value={snapshot.monthNet}
            currency={snapshot.currency}
            positive={snapshot.monthNet >= 0}
          />
          <SummaryStat
            label="Desde presupuesto"
            value={snapshot.automaticSurplus}
            currency={snapshot.currency}
            positive
          />
        </dl>
      </div>
    </section>
  );
}

function SummaryStat({
  label,
  value,
  currency,
  positive,
}: {
  label: string;
  value: number;
  currency: string;
  positive: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular mt-1 truncate text-sm font-semibold tracking-tight",
          positive ? "text-primary" : "text-destructive",
        )}
      >
        {value > 0 ? "+" : ""}
        {formatMoney(value, currency)}
      </dd>
    </div>
  );
}
