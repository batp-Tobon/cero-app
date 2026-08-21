import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PayButton } from "@/components/payments/payment-actions";
import { creditTypeIcon } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { formatShortDate } from "@/lib/dates";
import type { UpcomingPayment } from "@/types/domain";

/**
 * Próximos pagos. Una tarjeta por crédito con la cuota que toca, ordenadas
 * por urgencia: lo vencido primero.
 */
export function UpcomingPayments({ items }: { items: UpcomingPayment[] }) {
  if (items.length === 0) return null;

  return (
    <section aria-labelledby="upcoming" className="mt-9">
      <h2 id="upcoming" className="text-base font-semibold tracking-tight">
        Próximos pagos
      </h2>

      <ul className="mt-3 space-y-2.5">
        {items.map((item) => {
          const Icon = creditTypeIcon(item.creditType);
          const overdue = item.state === "overdue";

          return (
            <li key={`${item.creditId}-${item.installmentNumber}`}>
              <Card className="flex items-center gap-3 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary">
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <Link
                    href={`/creditos/${item.creditId}`}
                    className="block truncate text-sm font-semibold hover:underline"
                  >
                    {item.creditName}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatShortDate(item.dueDate)} · Cuota{" "}
                    {item.installmentNumber} de {item.totalInstallments}
                  </p>
                  <p className="tabular mt-1.5 text-sm font-semibold">
                    {formatMoney(item.paymentAmount, item.currency)}
                  </p>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  {overdue && <Badge variant="danger">Vencida</Badge>}
                  <PayButton target={item} />
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
