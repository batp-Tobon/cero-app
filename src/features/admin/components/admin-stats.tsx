import { AlertTriangle, CircleDollarSign, ShieldCheck, Users } from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import type { AdminBillingMetricsRow } from "@/shared/types/database";

export function AdminStats({ metrics }: { metrics: AdminBillingMetricsRow }) {
  const adminLabel = metrics.total_admins === 1 ? "administrador" : "administradores";
  const failedLabel = metrics.failed_payments_30_days === 1 ? "pago fallido" : "pagos fallidos";
  const items = [
    {
      label: "Clientes",
      value: String(metrics.total_users),
      detail: `${metrics.total_admins} ${adminLabel}`,
      icon: Users,
      tone: "text-sky-400 bg-sky-400/10",
    },
    {
      label: "Con acceso",
      value: String(metrics.active_subscriptions + metrics.trial_subscriptions),
      detail: `${metrics.trial_subscriptions} en prueba`,
      icon: ShieldCheck,
      tone: "text-primary bg-primary/10",
    },
    {
      label: "Ingresos · 30 días",
      value: formatMoney(metrics.revenue_30_days),
      detail: "Pagos confirmados, no estimados",
      icon: CircleDollarSign,
      tone: "text-warning bg-warning/10",
    },
    {
      label: "Requieren atención",
      value: String(
        metrics.past_due_subscriptions + metrics.failed_payments_30_days,
      ),
      detail: `${metrics.failed_payments_30_days} ${failedLabel}`,
      icon: AlertTriangle,
      tone: "text-destructive bg-destructive/10",
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-2.5">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.label} className="min-w-0 rounded-3xl bg-card p-4">
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-full ${item.tone}`}
            >
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <dt className="mt-3 eyebrow-sm">
              {item.label}
            </dt>
            <dd className="tabular mt-1 break-words text-xl font-semibold tracking-tight">
              {item.value}
            </dd>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {item.detail}
            </p>
          </div>
        );
      })}
    </dl>
  );
}
