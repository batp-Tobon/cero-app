import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { getCurrentProfile } from "@/infrastructure/supabase/server";
import {
  buildOverview,
  buildUpcomingPayments,
  getCreditSummaries,
} from "@/server/queries/credits";
import { getRevolvingSummaries } from "@/server/queries/revolving";
import { DebtSummary } from "@/components/dashboard/debt-summary";
import { UpcomingPayments } from "@/components/dashboard/upcoming-payments";
import { MonthSummary } from "@/components/dashboard/month-summary";
import { CreditMix } from "@/components/dashboard/credit-mix";
import { UserAvatar } from "@/components/layout/user-avatar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { greeting } from "@/lib/dates";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  let summaries;
  let cards;
  try {
    [summaries, cards] = await Promise.all([
      getCreditSummaries(),
      getRevolvingSummaries(),
    ]);
  } catch (error) {
    return (
      <ErrorState
        title="No pudimos cargar tus créditos"
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const overview = buildOverview(summaries, cards);
  const upcoming = buildUpcomingPayments(summaries);
  const name = firstName(profile?.full_name) || "de nuevo";

  return (
    <div className="animate-fade-in">
      <header className="flex items-center justify-between gap-4 pt-safe">
        <p className="text-base font-semibold tracking-tight">
          {greeting()}, {name}
        </p>
        <UserAvatar
          name={profile?.full_name ?? null}
          avatarUrl={profile?.avatar_url ?? null}
          href="/perfil"
        />
      </header>

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
          <CreditMix
            credits={summaries.filter((c) => c.status === "active")}
            totalDebt={overview.totalDebt}
          />
        </>
      )}
    </div>
  );
}
