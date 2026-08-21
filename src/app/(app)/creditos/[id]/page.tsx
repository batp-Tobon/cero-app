import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CheckCircle2, Users } from "lucide-react";
import { getCreditDetail, getCreditPayments } from "@/server/queries/credits";
import { getCreditMembers } from "@/server/actions/members";
import { getCurrentUser } from "@/infrastructure/supabase/server";
import { PageHeader } from "@/components/layout/page-header";
import { CardEyebrow } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScheduleList } from "@/components/credits/schedule-list";
import { CreditMenu } from "@/components/credits/credit-menu";
import { PaymentHistory } from "@/components/payments/payment-history";
import {
  ExtraPrincipalButton,
  PayButton,
} from "@/components/payments/payment-actions";
import { amortizationLabel, creditTypeLabel } from "@/lib/constants";
import { formatMoney, formatRate } from "@/lib/format";
import { formatLongDate } from "@/lib/dates";
import { percent } from "@/lib/utils";
import type { PaymentTarget } from "@/types/domain";

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const detail = await getCreditDetail(id);
  return { title: detail?.credit.name ?? "Crédito" };
}

export default async function CreditDetailPage({ params }: Params) {
  const { id } = await params;
  const detail = await getCreditDetail(id);
  if (!detail) notFound();

  const { credit, summary, installments } = detail;

  const [user, members, payments] = await Promise.all([
    getCurrentUser(),
    getCreditMembers(id),
    getCreditPayments(id),
  ]);
  const isOwner = credit.owner_id === user?.id;
  const sharedWith = members.filter((m) => m.role !== "owner");
  const subtitle = [credit.entity, creditTypeLabel(credit.type)]
    .filter(Boolean)
    .join(" · ");
  const progress = percent(
    summary.paid_installments,
    summary.total_installments,
  );
  const settled = credit.status === "paid" || summary.balance <= 0;

  const target: PaymentTarget | null =
    summary.next_installment_number != null && summary.next_due_date
      ? {
          creditId: credit.id,
          creditName: credit.name,
          currency: credit.currency,
          installmentNumber: summary.next_installment_number,
          totalInstallments: summary.total_installments,
          dueDate: summary.next_due_date,
          paymentAmount: Number(summary.next_payment_amount ?? 0),
          interestAmount: Number(summary.next_interest_amount ?? 0),
          principalAmount: Number(summary.next_principal_amount ?? 0),
          openingBalance: Number(summary.balance),
        }
      : null;

  return (
    <div className="animate-fade-in pb-4">
      <PageHeader
        title={credit.name}
        subtitle={subtitle}
        backHref="/creditos"
        centered
        action={
          <CreditMenu credit={credit} members={members} isOwner={isOwner} />
        }
      />

      <section aria-labelledby="balance" className="mt-7 text-center">
        <CardEyebrow id="balance">Saldo pendiente</CardEyebrow>
        <p className="tabular mt-2 text-[2.4rem] font-bold leading-none tracking-tight">
          {formatMoney(summary.balance, credit.currency)}
        </p>
      </section>

      {sharedWith.length > 0 && (
        <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <Users className="h-3.5 w-3.5" aria-hidden />
          Compartido con{" "}
          {sharedWith
            .map((m) => m.fullName ?? m.email ?? "otra persona")
            .join(", ")}
        </p>
      )}

      <dl className="mt-7 grid grid-cols-3 gap-2.5">
        <Stat
          label="Cuota mensual"
          value={formatMoney(
            summary.next_payment_amount ?? credit.principal_amount / credit.term_months,
            credit.currency,
          )}
        />
        <Stat
          label="Tasa"
          value={
            credit.amortization_system === "zero_interest"
              ? "Sin interés"
              : formatRate(credit.interest_rate_monthly)
          }
        />
        <Stat
          label="Progreso"
          value={`${summary.paid_installments} / ${summary.total_installments}`}
          hint="cuotas"
        />
      </dl>

      <div className="mt-4">
        <Progress
          value={progress}
          aria-label={`${summary.paid_installments} de ${summary.total_installments} cuotas pagadas`}
        />
      </div>

      {settled ? (
        <div className="mt-7 flex flex-col items-center rounded-3xl bg-primary/10 px-5 py-7 text-center">
          <CheckCircle2 className="h-7 w-7 text-primary" aria-hidden />
          <p className="mt-3 text-base font-semibold">Crédito pagado</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Pagaste {formatMoney(summary.total_paid, credit.currency)} en total,
            de los cuales {formatMoney(summary.total_interest_paid, credit.currency)}{" "}
            fueron intereses.
          </p>
        </div>
      ) : (
        target && (
          <section
            aria-labelledby="next-payment"
            className="mt-7 rounded-3xl bg-card p-5"
          >
            <CardEyebrow id="next-payment">Próximo pago</CardEyebrow>
            <div className="mt-2 flex items-baseline justify-between gap-4">
              <p className="text-sm text-muted-foreground">
                {formatLongDate(target.dueDate)}
              </p>
              <p className="tabular text-lg font-bold">
                {formatMoney(target.paymentAmount, credit.currency)}
              </p>
            </div>

            <div className="mt-5 space-y-2.5">
              <PayButton
                target={target}
                label="Registrar pago"
                size="default"
                className="w-full"
              />
              <ExtraPrincipalButton
                creditId={credit.id}
                creditName={credit.name}
                currency={credit.currency}
                balance={Number(summary.balance)}
                mode={credit.extra_principal_mode}
                className="w-full"
              />
            </div>
          </section>
        )
      )}

      <ScheduleList installments={installments} currency={credit.currency} />

      <PaymentHistory payments={payments} currency={credit.currency} />

      <section className="mt-8 rounded-3xl bg-card p-5">
        <h2 className="text-base font-semibold tracking-tight">
          Detalle del crédito
        </h2>
        <dl className="mt-4 space-y-3 text-sm">
          <Row label="Monto financiado">
            {formatMoney(credit.principal_amount, credit.currency)}
          </Row>
          <Row label="Sistema">{amortizationLabel(credit.amortization_system)}</Row>
          <Row label="Plazo">{credit.term_months} meses</Row>
          <Row label="Primera cuota">
            {formatLongDate(credit.first_payment_date)}
          </Row>
          <Row label="Intereses pagados">
            {formatMoney(summary.total_interest_paid, credit.currency)}
          </Row>
          <Row label="Intereses por pagar">
            {formatMoney(summary.remaining_interest, credit.currency)}
          </Row>
          <Row label="Abonos a capital">
            {formatMoney(summary.total_extra_principal, credit.currency)}
          </Row>
        </dl>
        {credit.notes && (
          <p className="mt-4 border-t border-border pt-4 text-sm leading-relaxed text-muted-foreground">
            {credit.notes}
          </p>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3.5 text-center">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="tabular mt-1.5 text-sm font-semibold leading-tight">
        {value}
        {hint && (
          <span className="block text-[10px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </dd>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{children}</dd>
    </div>
  );
}
