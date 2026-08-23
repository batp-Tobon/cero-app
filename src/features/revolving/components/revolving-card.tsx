import Link from "next/link";
import { ChevronRight, CreditCard, Wallet } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { Progress } from "@/shared/ui/progress";
import { formatMoney } from "@/shared/lib/format";
import { formatShortDate, todayISO } from "@/shared/lib/dates";
import { percent } from "@/shared/lib/utils";
import { accent, productIcon } from "@/shared/lib/appearance";
import { ProductBadge } from "@/shared/components/product-badge";
import type { RevolvingSummary } from "@/features/revolving/queries";

/**
 * Tarjeta rotativa en la lista. La barra mide CUPO USADO, no progreso: aquí
 * llenarse es lo malo, así que se pinta en ámbar y en rojo cuando aprieta.
 */
export function RevolvingCard({ account }: { account: RevolvingSummary }) {
  const Icon = productIcon(
    account.icon,
    account.kind === "credit_card" ? CreditCard : Wallet,
  );
  const used = percent(Number(account.balance), Number(account.credit_limit));
  const overdue =
    account.statement_due_date != null &&
    account.statement_due_date < todayISO() &&
    Number(account.statement_total_due ?? 0) >
      Number(account.statement_paid_amount ?? 0);

  return (
    <Link
      href={`/tarjetas/${account.id}`}
      className="block rounded-3xl focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Card className="transition-colors hover:bg-secondary">
        <div className="flex items-start gap-3">
          <ProductBadge icon={Icon} color={account.color} />

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{account.name}</h3>
            <p className="truncate text-xs text-muted-foreground">
              {[account.entity, account.last_four && `•••• ${account.last_four}`]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          {overdue && <Badge variant="danger">Vencida</Badge>}
          <ChevronRight
            className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </div>

        <p className="figure-card mt-4">
          {formatMoney(account.balance, account.currency)}
        </p>
        <p className="text-xs text-muted-foreground">cupo usado</p>

        <div className="mt-4 space-y-1.5">
          <Progress
            value={used}
            aria-label={`${Math.round(used)}% del cupo usado`}
            // El cupo usado avisa por si solo: en rojo cuando aprieta, y con
            // el color del producto mientras haya holgura.
            indicatorClassName={
              used >= 80
                ? "bg-destructive"
                : used >= 50
                  ? "bg-warning"
                  : accent(account.color).bar
            }
          />
          <div className="flex items-baseline justify-between gap-4 text-xs text-muted-foreground">
            <span className="tabular">
              {formatMoney(account.available, account.currency)} disponible
            </span>
            <span className="tabular">
              de {formatMoney(account.credit_limit, account.currency)}
            </span>
          </div>
        </div>

        {account.statement_total_due != null && (
          <p className="tabular mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            Pagar {formatMoney(account.statement_total_due, account.currency)}
            {account.statement_due_date &&
              ` antes del ${formatShortDate(account.statement_due_date)}`}
          </p>
        )}
      </Card>
    </Link>
  );
}
