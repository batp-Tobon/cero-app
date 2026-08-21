import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { getCurrentProfile } from "@/infrastructure/supabase/server";
import {
  buildOverview,
  buildUpcomingPayments,
  getCreditSummaries,
} from "@/server/queries/credits";
import { DebtSummary } from "@/components/dashboard/debt-summary";
import { UpcomingPayments } from "@/components/dashboard/upcoming-payments";
import { UserAvatar } from "@/components/layout/user-avatar";
import { EmptyState, ErrorState } from "@/components/common/states";
import { greeting } from "@/lib/dates";
import { firstName } from "@/lib/utils";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  let summaries;
  try {
    summaries = await getCreditSummaries();
  } catch (error) {
    return (
      <ErrorState
        title="No pudimos cargar tus créditos"
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }

  const overview = buildOverview(summaries);
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

      {summaries.length === 0 ? (
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
          <UpcomingPayments items={upcoming} />
        </>
      )}
    </div>
  );
}
