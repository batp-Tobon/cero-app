import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PayButton } from "@/components/payments/payment-actions";
import { MovementButton } from "@/components/revolving/revolving-actions";
import { creditTypeIcon } from "@/lib/constants";
import { productIcon } from "@/lib/appearance";
import { ProductBadge } from "@/components/common/product-badge";
import { formatMoney } from "@/lib/format";
import { formatShortDate, diffDays, todayISO } from "@/lib/dates";
import type { UpcomingItem } from "@/types/domain";

/** "vence en 3 días", "vence hoy", "venció hace 5 días". */
function dueLabel(dueDate: string, today: string): string {
  const days = diffDays(today, dueDate);
  if (days === 0) return "vence hoy";
  if (days === 1) return "vence mañana";
  if (days > 1) return `vence en ${days} días`;
  if (days === -1) return "venció ayer";
  return `venció hace ${Math.abs(days)} días`;
}

/**
 * Próximos pagos: cuotas de crédito y extractos de tarjeta en la misma lista,
 * ordenados por fecha. Quien mira no separa "créditos" de "tarjetas": separa lo
 * que vence esta semana de lo que vence el mes que viene.
 */
export function UpcomingPayments({ items }: { items: UpcomingItem[] }) {
  if (items.length === 0) return null;
  const today = todayISO();

  return (
    <section aria-labelledby="upcoming" className="mt-9">
      <h2 id="upcoming" className="text-base font-semibold tracking-tight">
        Próximos pagos
      </h2>

      <ul className="mt-3 space-y-2.5">
        {items.map((item) => {
          const overdue = item.state === "overdue";
          const soon = !overdue && diffDays(today, item.dueDate) <= 7;

          const Icon = productIcon(
            item.icon,
            item.kind === "credit" ? creditTypeIcon(item.creditType) : CreditCard,
          );
          const href =
            item.kind === "credit"
              ? `/creditos/${item.creditId}`
              : `/tarjetas/${item.accountId}`;
          const name =
            item.kind === "credit" ? item.creditName : item.accountName;
          const detail =
            item.kind === "credit"
              ? `Cuota ${item.installmentNumber} de ${item.totalInstallments}`
              : `Mínimo ${formatMoney(item.minimum, item.currency)}`;

          return (
            <li key={href + item.dueDate}>
              <Card className="flex items-center gap-3 p-4">
                <ProductBadge icon={Icon} color={item.color} />

                <div className="min-w-0 flex-1">
                  <Link
                    href={href}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    {name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatShortDate(item.dueDate)} · {detail}
                  </p>
                  <p className="tabular mt-1.5 text-sm font-semibold">
                    {formatMoney(item.amountDue, item.currency)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {overdue ? (
                    <Badge variant="danger">Vencida</Badge>
                  ) : soon ? (
                    <Badge variant="warning">{dueLabel(item.dueDate, today)}</Badge>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">
                      {dueLabel(item.dueDate, today)}
                    </span>
                  )}

                  {item.kind === "credit" ? (
                    <PayButton target={item} />
                  ) : (
                    <MovementButton
                      accountId={item.accountId}
                      accountName={item.accountName}
                      currency={item.currency}
                      balance={item.balance}
                      available={item.available}
                      label="Pagar"
                      size="sm"
                    />
                  )}
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
