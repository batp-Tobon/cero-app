import Link from "next/link";
import { Banknote, ChevronRight } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardEyebrow } from "@/shared/ui/card";
import { formatMoney } from "@/shared/lib/format";
import { formatShortDate, todayISO } from "@/shared/lib/dates";
import type { DashboardBudget } from "@/features/dashboard/queries";

/**
 * El sueldo del mes, antes de la deuda.
 *
 * Va primero a propósito: es el número contra el que se decide todo lo demás.
 * Ver "debes $238M" sin saber con cuánto se cuenta no ayuda a decidir nada.
 *
 * Se muestra más pequeño que la deuda total para no disputarle el protagonismo
 * a la cifra que manda en la pantalla.
 */
export function IncomeSummary({ budget }: { budget: DashboardBudget }) {
  // Sin presupuesto no se inventa una cifra: se invita a crearlo.
  if (budget.incomes.length === 0) {
    return (
      <Card asChild className="mt-4 py-4">
        <Link
          href="/presupuesto"
          className="flex items-center gap-3 transition-colors hover:bg-accent"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Banknote className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              Registra tu sueldo
            </span>
            <span className="block text-xs leading-relaxed text-muted-foreground">
              Para saber con cuánto cuentas antes de pagar.
            </span>
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        </Link>
      </Card>
    );
  }

  const single = budget.incomes.length === 1 ? budget.incomes[0] : null;
  const currency = budget.currency ?? undefined;

  return (
    <Card asChild className="mt-4">
      <Link
        href="/presupuesto"
        aria-label="Ver el presupuesto del mes"
        className="block transition-colors hover:bg-accent"
      >
        <div className="flex items-center justify-between gap-3">
          {/* El rótulo es el nombre que la persona le puso al ingreso
              —"Sueldo", "Nómina", "Quincena"—; sustituirlo por una etiqueta
              genérica le quitaría el suyo. */}
          <CardEyebrow>{single ? single.name : "Ingresos del mes"}</CardEyebrow>
          {budget.source === "projected" && (
            <Badge variant="warning">Previsto</Badge>
          )}
        </div>

        <p className="figure-lead mt-2 text-primary">
          {formatMoney(budget.total, currency)}
        </p>

        {single ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {receivedLabel(single.receivedDate)}
          </p>
        ) : (
          <dl className="mt-3 space-y-1.5 border-t border-border/70 pt-3">
            {budget.incomes.map((income) => (
              <div
                key={`${income.name}-${income.receivedDate}`}
                className="flex items-baseline justify-between gap-3 text-xs"
              >
                <dt className="min-w-0 truncate text-muted-foreground">
                  {income.name}
                  <span className="ml-1.5 tabular">
                    · {formatShortDate(income.receivedDate)}
                  </span>
                </dt>
                <dd className="tabular shrink-0 font-semibold">
                  {formatMoney(income.amount, currency)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </Link>
    </Card>
  );
}

/**
 * Un ingreso con fecha futura todavía no se ha cobrado. Decir "recibido" de
 * algo que no ha llegado haría contar con dinero que no está en la cuenta.
 */
function receivedLabel(receivedDate: string): string {
  const verb = receivedDate <= todayISO() ? "Recibido" : "Llega";
  return `${verb} el ${formatShortDate(receivedDate)}`;
}
