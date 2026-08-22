import Link from "next/link";
import { CreditCard } from "lucide-react";
import { creditTypeIcon } from "@/shared/lib/constants";
import { accent, productIcon } from "@/shared/lib/appearance";
import { formatMoney, formatPercent } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import type { DebtSlice } from "@/shared/types/domain";

/**
 * Reparto de la deuda: créditos y tarjetas juntos.
 *
 * La barra mide CUÁNTO SE HA PAGADO de cada deuda, no cuánto pesa dentro del
 * total. Un crédito recién abierto se ve vacío aunque sea el más grande —
 * medir el peso hacía que un crédito sin un solo pago apareciera a media barra.
 */
export function CreditMix({ slices }: { slices: DebtSlice[] }) {
  if (slices.length < 2) return null;

  return (
    <section aria-labelledby="mix" className="mt-9">
      <h2 id="mix" className="text-base font-semibold tracking-tight">
        Tus deudas
      </h2>

      <ul className="mt-3 space-y-2.5">
        {slices.map((slice) => {
          const Icon = productIcon(
            slice.icon,
            slice.creditType ? creditTypeIcon(slice.creditType) : CreditCard,
          );
          const classes = accent(slice.color);
          const href =
            slice.kind === "credit"
              ? `/creditos/${slice.id}`
              : `/tarjetas/${slice.id}`;

          return (
            <li key={`${slice.kind}-${slice.id}`}>
              <Link
                href={href}
                className="block rounded-2xl bg-card p-4 transition-colors hover:bg-secondary"
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={cn("h-4 w-4 shrink-0", classes.text)}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {slice.name}
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">
                    {formatMoney(slice.balance, slice.currency)}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-2.5">
                  <div
                    className="h-1.5 flex-1 overflow-hidden rounded-full bg-accent"
                    role="presentation"
                  >
                    <div
                      className={cn("h-full rounded-full", classes.bar)}
                      style={{ width: `${slice.paidPercent}%` }}
                    />
                  </div>
                  <span className="tabular shrink-0 text-[11px] text-muted-foreground">
                    {formatPercent(slice.paidPercent, 1)} pagado
                  </span>
                </div>

                <p className="tabular mt-1.5 text-[11px] text-muted-foreground">
                  {slice.detail} · {formatPercent(slice.sharePercent, 0)} de tu
                  deuda
                </p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
