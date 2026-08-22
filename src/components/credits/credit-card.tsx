import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ShareRow } from "@/components/credits/share-row";
import { creditTypeIcon, creditTypeLabel } from "@/lib/constants";
import { accent, productIcon } from "@/lib/appearance";
import { ProductBadge } from "@/components/common/product-badge";
import { formatMoney } from "@/lib/format";
import { formatShortDate } from "@/lib/dates";
import { percent } from "@/lib/utils";
import type { CreditSummary } from "@/types/domain";
import type { CreditMember } from "@/server/actions/members";

/**
 * Tarjeta de la lista de créditos.
 *
 * El bloque de datos es el enlace al detalle; compartir queda FUERA de ese
 * enlace: un botón dentro de otro enlace no es HTML válido, y en móvil acabaría
 * abriendo el detalle al intentar pulsarlo.
 */
export function CreditCard({
  credit,
  members = [],
  isOwner,
}: {
  credit: CreditSummary;
  members?: CreditMember[];
  isOwner: boolean;
}) {
  const Icon = productIcon(credit.icon, creditTypeIcon(credit.type));
  const classes = accent(credit.color);
  const settled = credit.status === "paid";
  const progress = percent(credit.paid_installments, credit.total_installments);
  const subtitle = [creditTypeLabel(credit.type), credit.entity]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card className="p-0">
      <Link
        href={`/creditos/${credit.id}`}
        className="block rounded-3xl p-5 pb-4 transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-3">
          <ProductBadge icon={Icon} color={credit.color} />

          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold">{credit.name}</h3>
            <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
          </div>

          {credit.overdue_count > 0 && <Badge variant="danger">Vencida</Badge>}
          {settled && <Badge variant="success">Pagado</Badge>}

          <ChevronRight
            className="mt-1 h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </div>

        <p className="tabular mt-4 text-2xl font-bold tracking-tight">
          {formatMoney(credit.balance, credit.currency)}
        </p>

        <div className="mt-4 flex items-baseline justify-between gap-4 text-xs">
          <span className="text-muted-foreground">
            Cuota{" "}
            <span className="tabular text-foreground">
              {formatMoney(credit.next_payment_amount ?? 0, credit.currency)}
            </span>
          </span>
          {credit.next_due_date && (
            <span className="text-muted-foreground">
              {formatShortDate(credit.next_due_date)}
            </span>
          )}
        </div>

        <div className="mt-3 space-y-1.5">
          <Progress
            value={progress}
            indicatorClassName={classes.bar}
            aria-label={`${credit.paid_installments} de ${credit.total_installments} cuotas pagadas`}
          />
          <p className="tabular text-xs text-muted-foreground">
            {credit.paid_installments} / {credit.total_installments} cuotas
          </p>
        </div>
      </Link>

      <div className="border-t border-border/60 px-2 py-1">
        <ShareRow
          creditId={credit.id}
          creditName={credit.name}
          members={members}
          isOwner={isOwner}
        />
      </div>
    </Card>
  );
}
