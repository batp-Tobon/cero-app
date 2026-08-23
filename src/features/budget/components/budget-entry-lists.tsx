import Link from "next/link";
import {
  CircleDollarSign,
  CreditCard,
  Landmark,
  Pencil,
  Plus,
} from "lucide-react";
import { ProductBadge } from "@/shared/components/product-badge";
import { Card } from "@/shared/ui/card";
import { formatShortDate, todayISO } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/format";
import { productIcon } from "@/shared/lib/appearance";
import { cn } from "@/shared/lib/utils";
import type { EditableExpense, EditableIncome } from "./editor-types";
import { getBudgetCategory } from "./category-options";
import type { DebtObligation } from "../types";

export function SectionTitle({
  id,
  title,
  detail,
  onAdd,
  addLabel,
}: {
  id: string;
  title: string;
  detail: string;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-3">
      <div>
        <h2 id={id} className="title-section">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
      {onAdd && (
        <button
          type="button"
          onClick={onAdd}
          aria-label={addLabel}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary text-primary transition-colors hover:bg-accent"
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function IncomeList({
  incomes,
  currency,
  onAdd,
  onEdit,
}: {
  incomes: EditableIncome[];
  currency: string;
  onAdd: () => void;
  onEdit: (income: EditableIncome) => void;
}) {
  if (incomes.length === 0) {
    return (
      <EmptyEntry
        title="Registra el dinero que llega este mes"
        detail="Por ejemplo, tu sueldo con su valor y fecha."
        onClick={onAdd}
      />
    );
  }

  return (
    <ul className="mt-3 space-y-2.5">
      {incomes.map((income) => {
        const received = income.receivedDate <= todayISO();
        return (
          <li key={income.clientId}>
            <Card className="p-0">
              <button
                type="button"
                onClick={() => onEdit(income)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <CircleDollarSign className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{income.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatShortDate(income.receivedDate)} · {received ? "Recibido" : "Programado"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-sm font-semibold tracking-tight">
                    {formatMoney(income.amount, currency)}
                  </span>
                  <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                    <Pencil className="h-3 w-3" aria-hidden /> Editar
                  </span>
                </span>
              </button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

export function ExpenseList({
  expenses,
  currency,
  onAdd,
  onEdit,
}: {
  expenses: EditableExpense[];
  currency: string;
  onAdd: () => void;
  onEdit: (expense: EditableExpense) => void;
}) {
  if (expenses.length === 0) {
    return (
      <EmptyEntry
        title="Añade arriendo, comida o servicios"
        detail="Tú decides cuáles se repiten el próximo mes."
        onClick={onAdd}
      />
    );
  }

  return (
    <ul className="mt-3 space-y-2.5">
      {expenses.map((expense) => {
        const category = getBudgetCategory(expense.category);
        const Icon = category.icon;
        return (
          <li key={expense.clientId}>
            <Card className="p-0">
              <button
                type="button"
                onClick={() => onEdit(expense)}
                className="flex w-full items-center gap-3 p-4 text-left"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{expense.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Día {expense.dueDay} · {category.label}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-sm font-semibold tracking-tight">
                    {formatMoney(expense.amount, currency)}
                  </span>
                  <span className="mt-1 block text-[10px] text-muted-foreground">
                    {expense.recurring ? "Recurrente" : "Solo este mes"}
                  </span>
                </span>
              </button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

export function ObligationList({ obligations }: { obligations: DebtObligation[] }) {
  if (obligations.length === 0) {
    return (
      <p className="mt-3 rounded-2xl bg-card p-4 text-sm text-muted-foreground">
        No hay cuotas ni extractos registrados para este mes.
      </p>
    );
  }

  return (
    <ul className="mt-3 space-y-2.5">
      {obligations.map((obligation) => {
        const Icon = productIcon(
          obligation.icon,
          obligation.kind === "credit" ? Landmark : CreditCard,
        );
        return (
          <li key={obligation.id}>
            <Card className="p-0" asChild>
              <Link href={obligation.href} className="flex items-center gap-3 p-4">
                <ProductBadge icon={Icon} color={obligation.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{obligation.name}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {formatShortDate(obligation.dueDate)} · {obligation.kind === "credit" ? "Cuota" : "Extracto"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="tabular block text-sm font-semibold tracking-tight">
                    {formatMoney(obligation.amount, obligation.currency)}
                  </span>
                  <span
                    className={cn(
                      "mt-1 block text-[10px] font-semibold",
                      obligation.status === "paid"
                        ? "text-primary"
                        : obligation.status === "overdue"
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {obligation.status === "paid"
                      ? "Pagado"
                      : obligation.status === "partial"
                        ? "Pago parcial"
                        : obligation.status === "overdue"
                          ? "Vencido"
                          : "Pendiente"}
                  </span>
                </span>
              </Link>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}

function EmptyEntry({
  title,
  detail,
  onClick,
}: {
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 flex w-full flex-col items-center rounded-3xl border border-dashed border-border px-6 py-7 text-center transition-colors hover:bg-card"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-primary">
        <Plus className="h-4 w-4" aria-hidden />
      </span>
      <span className="mt-3 text-sm font-semibold">{title}</span>
      <span className="mt-1 text-xs text-muted-foreground">{detail}</span>
    </button>
  );
}
