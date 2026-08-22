import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CreditCard,
  Percent,
  Receipt,
} from "lucide-react";
import { getRevolvingDetail } from "@/server/queries/revolving";
import { PageHeader } from "@/components/layout/page-header";
import { RevolvingMenu } from "@/components/revolving/revolving-menu";
import { CardEyebrow } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  MovementButton,
  StatementButton,
} from "@/components/revolving/revolving-actions";
import { formatMoney, formatPercent, formatRate } from "@/lib/format";
import { formatLongDate, formatShortDate } from "@/lib/dates";
import { percent } from "@/lib/utils";
import { accent, productIcon } from "@/lib/appearance";
import { ProductBadge } from "@/components/common/appearance-picker";
import type { MovementKindDB } from "@/types/database";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const detail = await getRevolvingDetail(id);
  return { title: detail?.account.name ?? "Tarjeta" };
}

const MOVEMENT_META: Record<
  MovementKindDB,
  { label: string; icon: typeof ArrowDownCircle; reducesDebt: boolean }
> = {
  payment: { label: "Pago", icon: ArrowDownCircle, reducesDebt: true },
  charge: { label: "Compra", icon: ArrowUpCircle, reducesDebt: false },
  interest: { label: "Intereses", icon: Percent, reducesDebt: false },
  fee: { label: "Cuota de manejo", icon: Receipt, reducesDebt: false },
};

export default async function RevolvingDetailPage({ params }: Params) {
  const { id } = await params;
  const detail = await getRevolvingDetail(id);
  if (!detail) notFound();

  const { account, summary, movements } = detail;
  const balance = Number(summary.balance);
  const available = Number(summary.available);
  const used = percent(balance, Number(account.credit_limit));
  const subtitle = [
    account.entity,
    account.last_four && `•••• ${account.last_four}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="animate-fade-in pb-4">
      <PageHeader
        title={account.name}
        subtitle={subtitle || undefined}
        backHref="/creditos"
        centered
        action={<RevolvingMenu account={account} />}
      />

      <section aria-labelledby="balance" className="mt-7 text-center">
        <ProductBadge
          icon={productIcon(account.icon, CreditCard)}
          color={account.color}
          size="lg"
          className="mx-auto mb-4"
        />
        <CardEyebrow id="balance">Cupo usado</CardEyebrow>
        <p className="tabular mt-2 text-[2.4rem] font-bold leading-none tracking-tight">
          {formatMoney(balance, account.currency)}
        </p>
        <p className="tabular mt-2 text-sm text-primary">
          {formatMoney(available, account.currency)} disponible
        </p>
      </section>

      <div className="mt-6 space-y-1.5">
        <Progress
          value={used}
          aria-label={`${Math.round(used)}% del cupo usado`}
          indicatorClassName={
            used >= 80
              ? "bg-destructive"
              : used >= 50
                ? "bg-warning"
                : accent(account.color).bar
          }
        />
        <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
          <span>{formatPercent(used, 0)} usado</span>
          <span className="tabular">
            cupo {formatMoney(account.credit_limit, account.currency)}
          </span>
        </div>
      </div>

      {summary.statement_total_due != null ? (
        <section
          aria-labelledby="statement"
          className="mt-7 rounded-3xl bg-card p-5"
        >
          <CardEyebrow id="statement">Extracto vigente</CardEyebrow>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              {summary.statement_due_date
                ? `Paga antes del ${formatLongDate(summary.statement_due_date)}`
                : "Sin fecha límite"}
            </p>
            <p className="tabular text-lg font-bold">
              {formatMoney(summary.statement_total_due, account.currency)}
            </p>
          </div>

          <dl className="mt-4 space-y-2 border-t border-border pt-3 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Mínimo a pagar</dt>
              <dd className="tabular font-medium">
                {formatMoney(summary.statement_minimum_due, account.currency)}
              </dd>
            </div>
            {summary.statement_reduced_minimum_due != null && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Mínimo reducido</dt>
                <dd className="tabular font-medium">
                  {formatMoney(
                    summary.statement_reduced_minimum_due,
                    account.currency,
                  )}
                </dd>
              </div>
            )}
            {summary.statement_date && (
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-muted-foreground">Fecha de corte</dt>
                <dd className="font-medium">
                  {formatShortDate(summary.statement_date)}
                </dd>
              </div>
            )}
          </dl>
        </section>
      ) : (
        <p className="mt-7 rounded-3xl bg-card p-5 text-sm leading-relaxed text-muted-foreground">
          Registra el extracto del corte para ver aquí cuánto y cuándo hay que
          pagar. Son cifras que fija el banco, no las calcula CERO.
        </p>
      )}

      <div className="mt-5 space-y-2.5">
        <MovementButton
          accountId={account.id}
          accountName={account.name}
          currency={account.currency}
          balance={balance}
          available={available}
          label="Registrar movimiento"
          className="w-full"
        />
        <StatementButton
          accountId={account.id}
          accountName={account.name}
          statementDay={account.statement_day}
          dueDay={account.due_day}
          className="w-full"
        />
      </div>

      <section aria-labelledby="movements" className="mt-8">
        <h2 id="movements" className="text-base font-semibold tracking-tight">
          Movimientos
        </h2>

        {movements.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-card p-5 text-sm text-muted-foreground">
            Todavía no hay movimientos registrados.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {movements.map((movement) => {
              const meta = MOVEMENT_META[movement.kind];
              const Icon = meta.icon;
              return (
                <li
                  key={movement.id}
                  className="flex items-center gap-3 rounded-2xl bg-card p-4"
                >
                  <span
                    className={
                      meta.reducesDebt
                        ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                        : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground"
                    }
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{meta.label}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatShortDate(movement.movement_date)}
                      {movement.description && ` · ${movement.description}`}
                    </p>
                  </div>

                  <p
                    className={
                      meta.reducesDebt
                        ? "tabular shrink-0 text-sm font-semibold text-primary"
                        : "tabular shrink-0 text-sm font-semibold"
                    }
                  >
                    {meta.reducesDebt ? "−" : "+"}
                    {formatMoney(movement.amount, account.currency)}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-3xl bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight">Detalle</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Cupo total</dt>
            <dd className="tabular font-medium">
              {formatMoney(account.credit_limit, account.currency)}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Tasa</dt>
            <dd className="tabular font-medium">
              {Number(account.interest_rate_monthly) > 0
                ? formatRate(account.interest_rate_monthly)
                : "No informada"}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Ciclo</dt>
            <dd className="font-medium">
              corte {account.statement_day} · pago {account.due_day}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">Total pagado</dt>
            <dd className="tabular font-medium text-primary">
              {formatMoney(summary.total_paid, account.currency)}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
