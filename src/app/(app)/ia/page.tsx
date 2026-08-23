import type { Metadata } from "next";
import Link from "next/link";
import { BrainCircuit, LockKeyhole, ShieldCheck } from "lucide-react";
import { calculateBudget } from "@/core/budget";
import { buildFinancialInsights } from "@/core/financial-insights";
import { buildOverview } from "@/core/portfolio";
import { getCurrentBillingEntitlement } from "@/features/billing/queries";
import { getBudgetSnapshot } from "@/features/budget/queries";
import { getCreditSummaries } from "@/features/credits/queries";
import { getRevolvingSummaries } from "@/features/revolving/queries";
import { planAllows } from "@/core/billing";
import { PageHeader } from "@/shared/components/page-header";
import { ErrorState } from "@/shared/components/states";
import { formatMoney } from "@/shared/lib/format";
import { todayISO } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";

export const metadata: Metadata = { title: "CERO Inteligente" };

export default async function AiInsightsPage() {
  const month = `${todayISO().slice(0, 7)}-01`;

  let entitlement;
  let budget;
  let credits;
  let cards;
  try {
    [entitlement, budget, credits, cards] = await Promise.all([
      getCurrentBillingEntitlement(),
      getBudgetSnapshot(month),
      getCreditSummaries(),
      getRevolvingSummaries(),
    ]);
  } catch (error) {
    return <ErrorState detail={error instanceof Error ? error.message : undefined} />;
  }

  const enabled = Boolean(
    entitlement?.canWrite && planAllows(entitlement, "ai_insights"),
  );

  if (!enabled) {
    return (
      <div className="animate-fade-in">
        <PageHeader title="CERO Inteligente" backHref="/inicio" />
        <div className="mt-12 flex flex-col items-center rounded-[2rem] bg-card px-6 py-10 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-muted-foreground">
            <LockKeyhole className="h-6 w-6" aria-hidden />
          </span>
          <h1 className="mt-5 font-serif text-2xl font-semibold">
            Activa CERO Pro
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
            El análisis inteligente está disponible durante los 5 días de prueba
            y en el plan Pro.
          </p>
          <Button className="mt-6" asChild>
            <Link href="/suscripcion">Activar CERO Pro</Link>
          </Button>
        </div>
      </div>
    );
  }

  const totals = calculateBudget(
    budget.incomes,
    budget.expenses,
    budget.obligations.map((item) => ({
      amount: Math.max(0, item.amount - item.paidAmount),
    })),
  );
  const overview = buildOverview(credits, cards);
  const cardLimit = cards.reduce(
    (sum, card) => sum + Number(card.credit_limit),
    0,
  );
  const insights = buildFinancialInsights({
    income: totals.income,
    remaining: totals.remaining,
    committedPercent: totals.committedPercent,
    monthlyDebtPayments: totals.debtPayments,
    totalDebt: overview.totalDebt,
    cardBalance: overview.revolvingDebt,
    cardLimit,
    overdueCount: overview.overdueCount,
  });

  return (
    <div className="animate-fade-in pb-4">
      <PageHeader title="CERO Inteligente" backHref="/inicio" />

      <header className="mt-5 rounded-[2rem] bg-gradient-to-br from-card to-primary/10 p-5">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
          <BrainCircuit className="h-5 w-5" aria-hidden />
        </span>
        <h1 className="mt-4 font-serif text-2xl font-semibold leading-tight">
          Lectura de tu mes
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Cruza presupuesto, créditos y tarjetas para destacar lo que requiere
          atención ahora.
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-card p-4">
          <dt className="eyebrow-sm">
            Disponible
          </dt>
          <dd className={cn(
            "tabular mt-1.5 text-lg font-bold",
            totals.remaining < 0 ? "text-destructive" : "text-primary",
          )}>
            {formatMoney(totals.remaining, budget.currency)}
          </dd>
        </div>
        <div className="rounded-2xl bg-card p-4">
          <dt className="eyebrow-sm">
            Comprometido
          </dt>
          <dd className="tabular mt-1.5 text-lg font-bold">
            {totals.committedPercent.toFixed(0)}%
          </dd>
        </div>
      </dl>

      <section aria-labelledby="insights" className="mt-8">
        <h2 id="insights" className="text-base font-semibold tracking-tight">
          Recomendaciones
        </h2>
        <div className="mt-3 space-y-2.5">
          {insights.map((insight) => (
            <article key={insight.id} className="rounded-3xl bg-card p-4">
              <div className="flex items-start gap-3">
                <span className={cn(
                  "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                  insight.tone === "positive" && "bg-primary",
                  insight.tone === "warning" && "bg-warning",
                  insight.tone === "danger" && "bg-destructive",
                  insight.tone === "neutral" && "bg-sky-400",
                )} />
                <div>
                  <h3 className="text-sm font-semibold">{insight.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {insight.detail}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <p className="mt-7 flex items-start gap-2 rounded-2xl border border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        Esta primera versión analiza agregados dentro de CERO. No comparte tus
        movimientos, comprobantes ni datos bancarios con proveedores externos.
      </p>
    </div>
  );
}
