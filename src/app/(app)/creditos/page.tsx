import Link from "next/link";
import type { Metadata } from "next";
import { Plus, Wallet } from "lucide-react";
import { getCreditSummaries } from "@/server/queries/credits";
import { CreditCard } from "@/components/credits/credit-card";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState, ErrorState } from "@/components/common/states";
import { formatMoney } from "@/lib/format";

export const metadata: Metadata = { title: "Créditos" };

export default async function CreditsPage() {
  let summaries;
  try {
    summaries = await getCreditSummaries();
  } catch (error) {
    return (
      <ErrorState detail={error instanceof Error ? error.message : undefined} />
    );
  }

  const active = summaries.filter((c) => c.status === "active");
  const settled = summaries.filter((c) => c.status !== "active");
  const totalBalance = active.reduce((s, c) => s + Number(c.balance), 0);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Créditos"
        subtitle={
          active.length > 0
            ? `${formatMoney(totalBalance, active[0].currency)} pendientes`
            : undefined
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

      {summaries.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="Todavía no tienes créditos"
          description="Añade uno y CERO genera el plan de pagos completo: cuota, intereses, fechas y saldo."
          actionLabel="Crear crédito"
          actionHref="/creditos/nuevo"
          className="mt-16"
        />
      ) : (
        <div className="mt-5 space-y-2.5">
          {active.map((credit) => (
            <CreditCard key={credit.id} credit={credit} />
          ))}

          {settled.length > 0 && (
            <>
              <h2 className="pt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                Terminados
              </h2>
              {settled.map((credit) => (
                <CreditCard key={credit.id} credit={credit} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
