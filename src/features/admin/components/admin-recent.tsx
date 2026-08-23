import { Badge } from "@/shared/ui/badge";
import { formatMoney } from "@/shared/lib/format";
import { AdminPaymentReview } from "@/features/admin/components/admin-payment-review";
import type {
  AdminAuditEvent,
  AdminPayment,
} from "@/features/admin/queries";

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(new Date(value));
}

function actionLabel(action: string): string {
  if (action === "user.role_changed") return "Rol actualizado";
  if (action === "subscription.changed") return "Suscripción actualizada";
  if (action === "payment.approved") return "Pago aprobado";
  if (action === "payment.rejected") return "Pago rechazado";
  return action;
}

export function AdminRecent({
  payments,
  audit,
}: {
  payments: AdminPayment[];
  audit: AdminAuditEvent[];
}) {
  return (
    <div className="mt-8 space-y-8">
      <section aria-labelledby="recent-payments">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent-payments" className="title-section">
            Pagos SaaS
          </h2>
          <span className="text-xs text-muted-foreground">Últimos movimientos</span>
        </div>

        {payments.length === 0 ? (
          <p className="mt-3 rounded-3xl border border-dashed border-border p-5 text-sm leading-relaxed text-muted-foreground">
            Aún no hay cobros comerciales. Las cuotas de créditos personales no aparecen aquí.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border overflow-hidden rounded-3xl bg-card px-4">
            {payments.map((payment) => (
              <li key={payment.id} className="py-3.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{payment.customer}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.provider} · {formatTimestamp(payment.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular text-sm font-semibold">
                      {formatMoney(payment.amount, payment.currency)}
                    </p>
                    <Badge
                      variant={payment.status === "succeeded" ? "success" : payment.status === "failed" ? "danger" : "warning"}
                    >
                      {payment.status}
                    </Badge>
                  </div>
                </div>
                {payment.provider === "bre-b" && payment.status === "pending" && (
                  <AdminPaymentReview
                    paymentId={payment.id}
                    proofUrl={payment.proofUrl}
                    submittedReference={payment.submittedReference}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="recent-audit">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent-audit" className="title-section">
            Auditoría
          </h2>
          <span className="text-xs text-muted-foreground">Inmutable</span>
        </div>

        {audit.length === 0 ? (
          <p className="mt-3 rounded-3xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            Los próximos cambios administrativos aparecerán aquí con su motivo.
          </p>
        ) : (
          <ol className="mt-3 space-y-2">
            {audit.map((event) => (
              <li key={event.id} className="rounded-3xl bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">{actionLabel(event.action)}</p>
                    <p className="truncate text-xs text-muted-foreground">{event.actor}</p>
                  </div>
                  <time className="shrink-0 text-[11px] text-muted-foreground">
                    {formatTimestamp(event.createdAt)}
                  </time>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {event.reason}
                </p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
