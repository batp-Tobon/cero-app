import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Wallet } from "lucide-react";
import { buildUpcoming, buildDebtSlices } from "@/features/credits/queries";
import { buildOverview } from "@/core/portfolio";
import { getDashboardSnapshot } from "@/features/dashboard/queries";
import { DebtSummary } from "@/features/dashboard/components/debt-summary";
import { UpcomingPayments } from "@/features/dashboard/components/upcoming-payments";
import { MonthSummary } from "@/features/dashboard/components/month-summary";
import { IncomeSummary } from "@/features/dashboard/components/income-summary";
import { CreditMix } from "@/features/dashboard/components/credit-mix";
import { UserAvatar } from "@/shared/components/user-avatar";
import { EmptyState, ErrorState } from "@/shared/components/states";
import { greeting } from "@/shared/lib/dates";
import { firstName } from "@/shared/lib/utils";
import { planAllows } from "@/core/billing";
import { AiEntryCard } from "@/features/ai/components/ai-entry-card";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  // Las tres consultas van en paralelo: pedir el perfil primero y esperar a
  // que vuelva antes de mirar los créditos añadía un viaje de red entero.
  let snapshot;
  try {
    snapshot = await getDashboardSnapshot();
  } catch (error) {
    return (
      <ErrorState
        title="No pudimos cargar tus créditos"
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const { profile, credits: summaries, cards, entitlement, budget } = snapshot;

  const overview = buildOverview(summaries, cards);
  const upcoming = buildUpcoming(summaries, cards);
  const name = firstName(profile?.fullName) || "de nuevo";
  const aiEnabled = Boolean(
    entitlement?.canWrite && planAllows(entitlement, "ai_insights"),
  );

  return (
    <div className="animate-fade-in">
      <header className="flex items-center justify-between gap-4">
        <p className="text-base font-semibold tracking-tight">
          {greeting()}, {name}
        </p>
        <div className="flex items-center gap-1.5">
          {profile?.role === "admin" && (
            <Link
              href="/admin"
              aria-label="Abrir panel administrativo"
              className="flex h-10 w-10 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10"
            >
              <ShieldCheck className="h-5 w-5" aria-hidden />
            </Link>
          )}
          <UserAvatar
            name={profile?.fullName ?? null}
            avatarUrl={profile?.avatarUrl ?? null}
            href="/perfil"
          />
        </div>
      </header>

      {/* El sueldo va antes que la deuda, y también cuando aún no hay créditos:
          saber con cuánto se cuenta no depende de deber algo. */}
      <IncomeSummary budget={budget} />

      {summaries.length === 0 && cards.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no tienes créditos"
          description="Registra tu primer crédito y CERO calcula el plan de pagos, el saldo y cuánto te falta para llegar a cero."
          actionLabel="Crear crédito"
          actionHref="/creditos/nuevo"
          className="mt-16"
        />
      ) : (
        <>
          <DebtSummary overview={overview} />
          <MonthSummary
            monthlyCommitment={overview.monthlyCommitment}
            installmentsDue={overview.installmentsDue}
            freeDate={overview.freeDate}
            currency={overview.currency}
          />
          <UpcomingPayments items={upcoming} />
          <CreditMix slices={buildDebtSlices(summaries, cards)} />
        </>
      )}
      <AiEntryCard enabled={aiEnabled} />
    </div>
  );
}
