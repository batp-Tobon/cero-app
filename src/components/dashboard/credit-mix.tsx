import Link from "next/link";
import { creditTypeIcon } from "@/lib/constants";
import { formatMoney, formatPercent } from "@/lib/format";
import { percent } from "@/lib/utils";
import type { CreditSummary } from "@/types/domain";

/**
 * Reparto de la deuda entre créditos: responde de un vistazo a "¿cuál pesa
 * más?", que es la pregunta previa a decidir dónde abonar.
 */
export function CreditMix({
  credits,
  totalDebt,
}: {
  credits: CreditSummary[];
  totalDebt: number;
}) {
  if (credits.length < 2) return null;

  const sorted = [...credits].sort(
    (a, b) => Number(b.balance) - Number(a.balance),
  );

  return (
    <section aria-labelledby="mix" className="mt-9">
      <h2 id="mix" className="text-base font-semibold tracking-tight">
        Tus deudas
      </h2>

      <ul className="mt-3 space-y-2.5">
        {sorted.map((credit) => {
          const Icon = creditTypeIcon(credit.type);
          const share = percent(Number(credit.balance), totalDebt);
          const progress = percent(
            credit.paid_installments,
            credit.total_installments,
          );

          return (
            <li key={credit.id}>
              <Link
                href={`/creditos/${credit.id}`}
                className="block rounded-2xl bg-card p-4 transition-colors hover:bg-secondary"
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className="h-4 w-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {credit.name}
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatMoney(credit.balance, credit.currency)}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2.5">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent"
                    role="presentation"
                  >
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${share}%` }}
                    />
                  </div>
                  <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                    {formatPercent(share, 0)} del total
                  </span>
                </div>

                <p className="tabular mt-1.5 text-[11px] text-muted-foreground">
                  {credit.paid_installments}/{credit.total_installments} cuotas ·{" "}
                  {formatPercent(progress, 0)} pagado
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
