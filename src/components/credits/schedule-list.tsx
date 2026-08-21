"use client";

import * as React from "react";
import { Check, Circle, Clock, AlertTriangle, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { formatShortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Installment, InstallmentState } from "@/types/domain";

const STATE_META: Record<
  InstallmentState,
  { label: string; icon: typeof Check; dot: string; text: string }
> = {
  paid: {
    label: "Pagada",
    icon: Check,
    dot: "bg-primary/15 text-primary",
    text: "text-muted-foreground",
  },
  next: {
    label: "Próxima",
    icon: Clock,
    dot: "bg-primary text-primary-foreground",
    text: "text-foreground",
  },
  overdue: {
    label: "Vencida",
    icon: AlertTriangle,
    dot: "bg-destructive/15 text-destructive",
    text: "text-destructive",
  },
  pending: {
    label: "Pendiente",
    icon: Circle,
    dot: "bg-secondary text-muted-foreground",
    text: "text-muted-foreground",
  },
};

/** Cuántas cuotas se muestran antes de pedir ver el plan completo. */
const PREVIEW = 6;

export function ScheduleList({
  installments,
  currency,
}: {
  installments: Installment[];
  currency: string;
}) {
  const [expanded, setExpanded] = React.useState(false);

  // La ventana arranca en la última cuota pagada: interesa lo que viene, no
  // el historial completo de un crédito a 72 meses.
  const firstUnpaid = installments.findIndex((i) => i.state !== "paid");
  const start = Math.max(0, (firstUnpaid === -1 ? installments.length : firstUnpaid) - 1);
  const visible = expanded
    ? installments
    : installments.slice(start, start + PREVIEW);

  if (installments.length === 0) return null;

  return (
    <section aria-labelledby="schedule" className="mt-8">
      <h2 id="schedule" className="text-base font-semibold tracking-tight">
        Plan de pagos
      </h2>

      <ol className="mt-3 space-y-1.5">
        {visible.map((row) => {
          const meta = STATE_META[row.state];
          const Icon = meta.icon;

          const extraBefore = Number(row.extra_principal_before ?? 0);

          return (
            <React.Fragment key={row.id}>
              {extraBefore > 0 && (
                <li className="flex items-center gap-3 px-4 py-1.5">
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary"
                    aria-hidden
                  >
                    <TrendingDown className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 text-xs text-muted-foreground">
                    Abono a capital
                  </span>
                  <span className="tabular text-xs font-semibold text-primary">
                    −{formatMoney(extraBefore, currency)}
                  </span>
                </li>
              )}
            <li
              className={cn(
                "flex items-center gap-3 rounded-2xl px-4 py-3",
                row.state === "next" ? "bg-secondary" : "bg-card",
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  meta.dot,
                )}
                aria-hidden
              >
                <Icon className="h-3.5 w-3.5" />
              </span>

              <div className="min-w-0 flex-1">
                <p className={cn("text-sm font-medium", meta.text)}>
                  Cuota {row.installment_number}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatShortDate(row.due_date)} · {meta.label}
                </p>
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={cn(
                    "tabular text-sm font-semibold",
                    row.state === "paid" && "text-muted-foreground",
                  )}
                >
                  {formatMoney(row.payment_amount, currency)}
                </p>
                <p className="tabular text-[11px] text-muted-foreground">
                  saldo {formatMoney(row.closing_balance, currency)}
                </p>
              </div>
            </li>
            </React.Fragment>
          );
        })}
      </ol>

      {installments.length > PREVIEW && (
        <Button
          variant="ghost"
          className="mt-2 w-full"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
        >
          {expanded
            ? "Mostrar menos"
            : `Ver todo el plan de pagos (${installments.length} cuotas)`}
        </Button>
      )}
    </section>
  );
}
