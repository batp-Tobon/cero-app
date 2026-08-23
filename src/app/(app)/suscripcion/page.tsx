import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, Clock3, ShieldCheck, Sparkles } from "lucide-react";
import { getSubscriptionPageData } from "@/features/billing/subscription";
import { SubscriptionActions } from "@/features/billing/components/subscription-actions";
import { PageHeader } from "@/shared/components/page-header";
import { ErrorState } from "@/shared/components/states";
import { formatMoney } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

export const metadata: Metadata = { title: "Plan y pagos" };

const STATUS_COPY = {
  administrator: "Acceso de administrador",
  trial_active: "Prueba gratuita activa",
  subscription_active: "CERO Pro activo",
  subscription_indefinite: "CERO Pro sin vencimiento",
  payment_grace: "Pago en periodo de gracia",
  cancellation_scheduled: "Activo hasta finalizar el periodo",
  free_plan: "Plan gratuito",
  trial_expired: "La prueba terminó",
  subscription_expired: "La suscripción terminó",
  payment_past_due: "Pago pendiente",
  subscription_canceled: "Suscripción cancelada",
  subscription_missing_period: "Suscripción por revisar",
} as const;

function formatAccessDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ pago?: string }>;
}) {
  const params = await searchParams;
  let data;
  try {
    data = await getSubscriptionPageData();
  } catch (error) {
    return <ErrorState detail={error instanceof Error ? error.message : undefined} />;
  }
  if (!data) redirect("/login?motivo=sesion");

  const amountLabel = formatMoney(
    Number(data.offer.price.amount),
    data.offer.price.currency,
  );
  const accessDate = formatAccessDate(data.entitlement.accessUntil);

  return (
    <div className="animate-fade-in pb-4">
      <PageHeader title="Plan y pagos" backHref="/perfil" />

      <header className="mt-5 rounded-[2rem] bg-gradient-to-br from-card to-primary/10 p-5">
        <div className="flex items-start justify-between gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-semibold",
              data.entitlement.canWrite
                ? "bg-primary/15 text-primary"
                : "bg-warning/15 text-warning",
            )}
          >
            {data.entitlement.canWrite ? "Con acceso" : "Sólo consulta"}
          </span>
        </div>
        <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
          Tu cuenta
        </p>
        <h1 className="mt-1 font-serif text-3xl font-semibold leading-tight">
          {STATUS_COPY[data.entitlement.reason]}
        </h1>
        {accessDate && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
            Acceso hasta el {accessDate}
          </p>
        )}
      </header>

      <section aria-labelledby="pro-plan" className="my-5 rounded-3xl bg-card p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="pro-plan" className="text-base font-semibold">
              {data.offer.plan.name}
            </h2>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {data.offer.plan.description}
            </p>
          </div>
          <p className="tabular shrink-0 text-lg font-bold text-primary">
            {amountLabel}
            <span className="block text-right text-[10px] font-normal text-muted-foreground">
              por mes
            </span>
          </p>
        </div>
        <ul className="mt-4 space-y-2 border-t border-border pt-4">
          {[
            "Créditos, tarjetas y presupuesto sin límites",
            "Comprobantes y trazabilidad de pagos",
            "CERO Inteligente y exportación de datos",
          ].map((feature) => (
            <li key={feature} className="flex items-start gap-2 text-xs text-muted-foreground">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
              {feature}
            </li>
          ))}
        </ul>
      </section>

      {data.entitlement.reason === "subscription_indefinite" ? (
        <div className="rounded-3xl border border-primary/25 bg-primary/10 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck className="h-4 w-4" aria-hidden />
            Acceso concedido por administración
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            No tienes una renovación pendiente. El acceso permanecerá activo hasta
            que un administrador cambie tu suscripción.
          </p>
        </div>
      ) : (
        <SubscriptionActions
          userId={data.userId}
          amountLabel={amountLabel}
          wompiEnabled={data.wompiEnabled}
          paymentKey={data.paymentKey}
          supportWhatsapp={data.supportWhatsapp}
          hasPendingManualPayment={Boolean(data.pendingManualPayment)}
          processingReturn={params.pago === "procesando"}
        />
      )}

      <p className="mt-5 flex items-start gap-2 rounded-2xl border border-border px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        El plan comercial nunca da acceso a tus créditos, movimientos ni comprobantes personales.
      </p>
    </div>
  );
}
