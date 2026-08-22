import Link from "next/link";
import type { Metadata } from "next";
import { CreditCard, Plus, Wallet } from "lucide-react";
import { getCreditSummaries } from "@/features/credits/queries";
import { getRevolvingSummaries } from "@/features/revolving/queries";
import { getAllCreditMembers } from "@/features/credits/members";
import { getCurrentUser } from "@/infrastructure/supabase/server";
import { CreditCard as CreditItem } from "@/features/credits/components/credit-card";
import { RevolvingCard } from "@/features/revolving/components/revolving-card";
import { PageHeader } from "@/shared/components/page-header";
import { EmptyState, ErrorState } from "@/shared/components/states";
import { formatMoney } from "@/shared/lib/format";

export const metadata: Metadata = { title: "Créditos" };

export default async function CreditsPage() {
  let summaries;
  let cards;
  let membersByCredit;
  let user;
  try {
    [summaries, cards, membersByCredit, user] = await Promise.all([
      getCreditSummaries(),
      getRevolvingSummaries(),
      getAllCreditMembers(),
      getCurrentUser(),
    ]);
  } catch (error) {
    return (
      <ErrorState detail={error instanceof Error ? error.message : undefined} />
    );
  }

  const active = summaries.filter((c) => c.status === "active");
  const settled = summaries.filter((c) => c.status !== "active");
  const activeCards = cards.filter((c) => c.status === "active");
  const totalBalance =
    active.reduce((s, c) => s + Number(c.balance), 0) +
    activeCards.reduce((s, c) => s + Number(c.balance), 0);
  const currency = active[0]?.currency ?? activeCards[0]?.currency ?? "COP";
  const isEmpty = summaries.length === 0 && cards.length === 0;

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Créditos"
        subtitle={
          isEmpty ? undefined : `${formatMoney(totalBalance, currency)} pendientes`
        }
        action={
          <Link
            href="/creditos/nuevo"
            aria-label="Crear crédito"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-5 w-5" aria-hidden />
          </Link>
        }
      />

      {isEmpty ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no tienes productos"
          description="Añade un crédito y CERO genera el plan de pagos completo: cuota, intereses, fechas y saldo."
          actionLabel="Crear crédito"
          actionHref="/creditos/nuevo"
          className="mt-16"
        />
      ) : (
        <div className="mt-5 space-y-2.5">
          {active.map((credit) => (
            <CreditItem
              key={credit.id}
              credit={credit}
              members={membersByCredit.get(credit.id) ?? []}
              isOwner={credit.owner_id === user?.id}
            />
          ))}

          <section aria-labelledby="cards" className="pt-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2
                id="cards"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
              >
                Tarjetas y cupos
              </h2>
              <Link
                href="/tarjetas/nueva"
                className="text-xs font-semibold text-primary hover:underline"
              >
                Añadir
              </Link>
            </div>

            {activeCards.length === 0 ? (
              <p className="mt-3 flex items-center gap-2.5 rounded-2xl bg-card p-4 text-sm text-muted-foreground">
                <CreditCard className="h-4 w-4 shrink-0" aria-hidden />
                Registra una tarjeta para seguir su cupo y su pago mínimo.
              </p>
            ) : (
              <div className="mt-3 space-y-2.5">
                {activeCards.map((card) => (
                  <RevolvingCard key={card.id} account={card} />
                ))}
              </div>
            )}
          </section>

          {settled.length > 0 && (
            <>
              <h2 className="pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Terminados
              </h2>
              {settled.map((credit) => (
                <CreditItem
                  key={credit.id}
                  credit={credit}
                  members={membersByCredit.get(credit.id) ?? []}
                  isOwner={credit.owner_id === user?.id}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
