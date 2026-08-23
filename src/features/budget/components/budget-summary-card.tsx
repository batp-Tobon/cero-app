import { Check } from "lucide-react";
import type { BudgetTotals } from "@/core/budget";
import { Badge } from "@/shared/ui/badge";
import { formatMoney } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { BudgetSnapshot } from "../types";

export function BudgetSummaryCard({
  totals,
  currency,
  source,
}: {
  totals: BudgetTotals;
  currency: string;
  source: BudgetSnapshot["source"];
}) {
  const debtWidth = totals.income
    ? Math.min(100, (totals.debtPayments / totals.income) * 100)
    : totals.debtPayments > 0
      ? 100
      : 0;
  const expenseWidth = totals.income
    ? Math.min(100 - debtWidth, (totals.expenses / totals.income) * 100)
    : 0;

  return (
    <section
      aria-labelledby="available-title"
      className="relative mt-5 overflow-hidden rounded-[2rem] bg-card p-5"
    >
      <div
        className="pointer-events-none absolute -right-14 -top-20 h-48 w-48 rounded-full bg-primary/10 blur-2xl"
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-center justify-between gap-3">
          <p
            id="available-title"
            className="eyebrow"
          >
            Disponible después de todo
          </p>
          {source === "projected" && (
            <Badge variant="warning">Proyección</Badge>
          )}
          {source === "saved" && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-primary">
              <Check className="h-3.5 w-3.5" aria-hidden /> Guardado
            </span>
          )}
        </div>

        <p
          className={cn(
            "figure-hero mt-3",
            totals.remaining < 0 ? "text-destructive" : "text-primary",
          )}
        >
          {formatMoney(totals.remaining, currency)}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          {totals.remaining < 0
            ? "Tus compromisos superan los ingresos de este mes."
            : totals.income === 0
              ? "Registra un ingreso para calcular cuánto te queda."
              : `${Math.max(0, 100 - totals.committedPercent).toFixed(0)}% de tus ingresos queda libre.`}
        </p>

        <div
          className="mt-5 flex h-2 overflow-hidden rounded-full bg-secondary"
          aria-label={`${totals.committedPercent.toFixed(0)}% de los ingresos comprometido`}
        >
          <span
            className="h-full bg-warning transition-[width]"
            style={{ width: `${debtWidth}%` }}
          />
          <span
            className="h-full bg-destructive transition-[width]"
            style={{ width: `${expenseWidth}%` }}
          />
        </div>

        <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-border/70 pt-4">
          <SummaryStat label="Ingresos" value={totals.income} currency={currency} />
          <SummaryStat
            label="Deudas"
            value={totals.debtPayments}
            currency={currency}
            tone="warning"
          />
          <SummaryStat
            label="Gastos"
            value={totals.expenses}
            currency={currency}
            tone="danger"
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
  tone,
}: {
  label: string;
  value: number;
  currency: string;
  tone?: "warning" | "danger";
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "tabular mt-1 truncate text-xs font-semibold tracking-tight",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-destructive",
        )}
      >
        {formatMoney(value, currency)}
      </dd>
    </div>
  );
}
