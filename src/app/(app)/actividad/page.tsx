import type { Metadata } from "next";
import { Activity as ActivityIcon } from "lucide-react";
import { getCurrentProfile } from "@/infrastructure/supabase/server";
import { getActivity } from "@/features/credits/queries";
import { ActivityTimeline } from "@/features/activity/components/activity-timeline";
import { PageHeader } from "@/shared/components/page-header";
import { EmptyState, ErrorState } from "@/shared/components/states";
import { formatMoney } from "@/shared/lib/format";
import { firstName } from "@/shared/lib/utils";
import { todayISO } from "@/shared/lib/dates";

export const metadata: Metadata = { title: "Actividad" };

export default async function ActivityPage() {
  let profile;
  let entries;
  try {
    [profile, entries] = await Promise.all([getCurrentProfile(), getActivity()]);
  } catch (error) {
    return (
      <ErrorState detail={error instanceof Error ? error.message : undefined} />
    );
  }

  // Total pagado este mes: la cifra que la gente busca al abrir el historial.
  const currentMonth = todayISO().slice(0, 7);
  const paidThisMonth = entries
    .filter(
      (e) =>
        (e.type === "payment" || e.type === "extra_principal") &&
        e.occurred_at.slice(0, 7) === currentMonth,
    )
    .reduce((sum, e) => sum + Number(e.amount ?? 0), 0);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Actividad" />

      {entries.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title="Aún no hay movimientos"
          description="Cuando registres un pago o un abono a capital, aparecerá aquí con su fecha y su importe."
          actionLabel="Ver mis créditos"
          actionHref="/creditos"
          className="mt-16"
        />
      ) : (
        <>
          <div className="mt-5 rounded-3xl bg-card p-5">
            <p className="eyebrow">
              Total pagado este mes
            </p>
            <p className="figure-card mt-2 text-primary">
              {formatMoney(paidThisMonth, profile?.currency)}
            </p>
          </div>

          <ActivityTimeline
            entries={entries}
            actorName={firstName(profile?.full_name) || null}
          />
        </>
      )}
    </div>
  );
}
