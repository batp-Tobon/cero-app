import Link from "next/link";
import { Banknote, ChevronRight } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Card, CardEyebrow } from "@/shared/ui/card";
import { formatMoney } from "@/shared/lib/format";
import { formatShortDate, todayISO } from "@/shared/lib/dates";
import { cn } from "@/shared/lib/utils";
import type { DashboardBudget } from "@/features/dashboard/queries";

/**
 * El sueldo del mes y lo que queda de él, antes de la deuda.
 *
 * Van juntos a propósito: el sueldo solo no dice si alcanza. Enfrentar la
 * cifra que entra con la que sobra convierte la tarjeta en una respuesta
 * ("¿con cuánto cuento para lo demás?") y no en un dato suelto.
 *
 * Las dos cifras son más pequeñas que la deuda total: informan la decisión,
 * pero la pantalla sigue siendo sobre la deuda.
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

  const { totals } = budget;
  const single = budget.incomes.length === 1 ? budget.incomes[0] : null;
  const currency = budget.currency ?? undefined;
  const deficit = totals.remaining < 0;
  const freePercent = Math.max(0, 100 - totals.committedPercent);

  // Anchos de la barra: primero las cuotas, después los gastos del hogar. Con
  // el sueldo en cero no hay proporción que calcular, pero sí hay compromisos:
  // la barra se llena para no dibujar un mes holgado que no existe.
  const debtWidth = totals.income
    ? Math.min(100, (totals.debtPayments / totals.income) * 100)
    : totals.debtPayments > 0
      ? 100
      : 0;
  const expenseWidth = totals.income
    ? Math.min(100 - debtWidth, (totals.expenses / totals.income) * 100)
    : 0;

  return (
    <Card asChild className="mt-4">
      <Link
        href="/presupuesto"
        aria-label="Ver el presupuesto del mes"
        className="block transition-colors hover:bg-accent"
      >
        <dl className="grid grid-cols-2 gap-3">
          <div className="min-w-0">
            {/* El rótulo es el nombre que la persona le puso al ingreso
                —"Sueldo", "Nómina", "Quincena"—; sustituirlo por una etiqueta
                genérica le quitaría el suyo. */}
            <dt>
              <CardEyebrow className="truncate">
                {single ? single.name : "Ingresos"}
              </CardEyebrow>
            </dt>
            <dd className="figure-card mt-2">
              {formatMoney(totals.income, currency)}
            </dd>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
              {single ? receivedLabel(single.receivedDate) : `${budget.incomes.length} ingresos`}
            </p>
          </div>

          <div className="min-w-0 border-l border-border/70 pl-3">
            <dt className="flex items-center justify-between gap-2">
              <CardEyebrow className="truncate">
                {deficit ? "Te falta" : "Disponible"}
              </CardEyebrow>
              {budget.source === "projected" && (
                <Badge variant="warning">Previsto</Badge>
              )}
            </dt>
            <dd
              className={cn(
                "figure-card mt-2",
                deficit ? "text-destructive" : "text-primary",
              )}
            >
              {formatMoney(totals.remaining, currency)}
            </dd>
            <p className="mt-1 text-[11px] leading-tight text-muted-foreground">
              {deficit
                ? "supera tu sueldo"
                : `${freePercent.toFixed(0)}% del sueldo libre`}
            </p>
          </div>
        </dl>

        <div
          className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-secondary"
          role="img"
          aria-label={`${totals.committedPercent.toFixed(0)}% del sueldo comprometido`}
        >
          <span
            className="h-full bg-warning"
            style={{ width: `${debtWidth}%` }}
          />
          <span
            className="h-full bg-destructive"
            style={{ width: `${expenseWidth}%` }}
          />
        </div>

        {/* Sólo cuando hay algo que restar: con el mes limpio, dos ceros no
            aportan nada y ensucian la tarjeta. */}
        {totals.totalOutflow > 0 && (
          <p className="tabular mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {totals.debtPayments > 0 && (
              <span>
                <span className="text-warning">−</span>{" "}
                {formatMoney(totals.debtPayments, currency)} cuotas
              </span>
            )}
            {totals.expenses > 0 && (
              <span>
                <span className="text-destructive">−</span>{" "}
                {formatMoney(totals.expenses, currency)} gastos
              </span>
            )}
          </p>
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
