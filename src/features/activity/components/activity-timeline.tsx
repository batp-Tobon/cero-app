import Link from "next/link";
import {
  ArrowDownCircle,
  CheckCircle2,
  FilePlus2,
  PenLine,
  Trash2,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { formatMoney } from "@/shared/lib/format";
import { formatMonthTitle, formatRelativeDay, todayISO } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/utils";
import type { ActivityTypeDB } from "@/shared/types/database";
import type { ActivityEntry } from "@/features/credits/queries";

const ICONS: Record<ActivityTypeDB, LucideIcon> = {
  payment: ArrowDownCircle,
  extra_principal: TrendingDown,
  credit_created: FilePlus2,
  credit_updated: PenLine,
  credit_deleted: Trash2,
  credit_paid: CheckCircle2,
};

/** Los movimientos que restan deuda se muestran en negativo y en verde. */
const REDUCES_DEBT = new Set<ActivityTypeDB>(["payment", "extra_principal"]);

/**
 * Línea de tiempo de movimientos, agrupada por mes. Sin tablas: es un diario,
 * no un extracto contable.
 */
export function ActivityTimeline({
  entries,
  actorName,
}: {
  entries: ActivityEntry[];
  actorName: string | null;
}) {
  const today = todayISO();
  const groups = groupByMonth(entries);

  return (
    <div className="mt-6 space-y-7">
      {groups.map(([month, items]) => (
        <section key={month} aria-labelledby={`month-${month}`}>
          <h2
            id={`month-${month}`}
            className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
          >
            {formatMonthTitle(`${month}-01`)}
          </h2>

          <ul className="mt-3 space-y-2.5">
            {items.map((entry) => {
              const Icon = ICONS[entry.type];
              const negative = REDUCES_DEBT.has(entry.type);
              const day = entry.occurred_at.slice(0, 10);

              return (
                <li
                  key={entry.id}
                  className="flex items-start gap-3 rounded-2xl bg-card p-4"
                >
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      negative
                        ? "bg-primary/15 text-primary"
                        : "bg-secondary text-muted-foreground",
                    )}
                    aria-hidden
                  >
                    <Icon className="h-4 w-4" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-medium">
                        {entry.title}
                      </p>
                      {entry.amount != null && (
                        <p
                          className={cn(
                            "tabular shrink-0 text-sm font-semibold",
                            negative ? "text-primary" : "text-foreground",
                          )}
                        >
                          {negative ? "−" : ""}
                          {formatMoney(Number(entry.amount))}
                        </p>
                      )}
                    </div>

                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {formatRelativeDay(day, today)}
                      {entry.creditName && (
                        <>
                          {" · "}
                          {entry.credit_id ? (
                            <Link
                              href={`/creditos/${entry.credit_id}`}
                              className="hover:text-foreground hover:underline"
                            >
                              {entry.creditName}
                            </Link>
                          ) : (
                            entry.creditName
                          )}
                        </>
                      )}
                      {actorName && ` · ${actorName}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Agrupa por `YYYY-MM` conservando el orden descendente de la consulta. */
function groupByMonth(entries: ActivityEntry[]): Array<[string, ActivityEntry[]]> {
  const map = new Map<string, ActivityEntry[]>();
  for (const entry of entries) {
    const month = entry.occurred_at.slice(0, 7);
    const bucket = map.get(month);
    if (bucket) bucket.push(entry);
    else map.set(month, [entry]);
  }
  return [...map.entries()];
}
