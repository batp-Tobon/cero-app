"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDollarSign,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { calculateBudget } from "@/core/budget";
import { saveMonthlyBudget } from "@/features/budget/actions";
import type { BudgetSnapshot } from "@/features/budget/types";
import { MonthNavigation } from "@/shared/components/month-navigation";
import { PageHeader } from "@/shared/components/page-header";
import { InlineNotice } from "@/shared/components/states";
import { Button } from "@/shared/ui/button";
import { formatMonthTitle } from "@/shared/lib/dates";
import { formatMoney } from "@/shared/lib/format";
import {
  ExpenseEntrySheet,
  IncomeEntrySheet,
} from "./budget-entry-sheets";
import {
  ExpenseList,
  IncomeList,
  ObligationList,
  SectionTitle,
} from "./budget-entry-lists";
import { BudgetSummaryCard } from "./budget-summary-card";
import type { EditableExpense, EditableIncome } from "./editor-types";

export function BudgetPlanner({ snapshot }: { snapshot: BudgetSnapshot }) {
  const router = useRouter();
  const nextId = React.useRef(0);
  const [incomes, setIncomes] = React.useState<EditableIncome[]>(
    snapshot.incomes.map((income) => ({ ...income, clientId: income.id })),
  );
  const [expenses, setExpenses] = React.useState<EditableExpense[]>(
    snapshot.expenses.map((expense) => ({ ...expense, clientId: expense.id })),
  );
  const [incomeDraft, setIncomeDraft] = React.useState<EditableIncome | null>(null);
  const [expenseDraft, setExpenseDraft] = React.useState<EditableExpense | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const totals = calculateBudget(incomes, expenses, snapshot.obligations);
  const ready =
    incomes.every(
      (income) =>
        income.name.trim().length > 0 &&
        income.amount > 0 &&
        income.receivedDate.startsWith(snapshot.month.slice(0, 7)),
    ) &&
    expenses.every(
      (expense) => expense.name.trim().length > 0 && expense.amount > 0,
    );

  function createClientId(kind: "income" | "expense") {
    nextId.current += 1;
    return `new:${kind}:${nextId.current}`;
  }

  function addIncome() {
    setIncomeDraft({
      id: "",
      clientId: createClientId("income"),
      name: "Sueldo",
      amount: 0,
      receivedDate: snapshot.month,
      recurring: true,
    });
  }

  function addExpense() {
    setExpenseDraft({
      id: "",
      clientId: createClientId("expense"),
      name: "",
      category: "other",
      amount: 0,
      dueDay: 1,
      recurring: true,
    });
  }

  function commitIncome() {
    if (!incomeDraft) return;
    setIncomes((current) =>
      current.some((income) => income.clientId === incomeDraft.clientId)
        ? current.map((income) =>
            income.clientId === incomeDraft.clientId ? incomeDraft : income,
          )
        : [...current, incomeDraft],
    );
    setIncomeDraft(null);
  }

  function commitExpense() {
    if (!expenseDraft) return;
    setExpenses((current) =>
      current.some((expense) => expense.clientId === expenseDraft.clientId)
        ? current.map((expense) =>
            expense.clientId === expenseDraft.clientId ? expenseDraft : expense,
          )
        : [...current, expenseDraft],
    );
    setExpenseDraft(null);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;

    setPending(true);
    setError(null);
    const result = await saveMonthlyBudget({
      month: snapshot.month,
      currency: snapshot.currency,
      incomes: incomes.map(({ name, amount, receivedDate, recurring }) => ({
        name,
        amount,
        receivedDate,
        recurring,
      })),
      expenses: expenses.map(({ name, category, amount, dueDay, recurring }) => ({
        name,
        category,
        amount,
        dueDay,
        recurring,
      })),
    });
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    toast.success("Presupuesto guardado");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="animate-fade-in pb-4" noValidate>
      <PageHeader
        title="Presupuesto"
        subtitle="Control mensual"
        action={
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <CircleDollarSign className="h-5 w-5" aria-hidden />
          </span>
        }
      />
      <MonthNavigation month={snapshot.month} basePath="/presupuesto" />

      <BudgetSummaryCard
        totals={totals}
        currency={snapshot.currency}
        source={snapshot.source}
      />

      {snapshot.source === "projected" && snapshot.sourceMonth && (
        <p className="mt-3 rounded-2xl bg-warning/10 px-4 py-3 text-xs leading-relaxed text-warning">
          Copiamos los ingresos y gastos recurrentes de {formatMonthTitle(
            snapshot.sourceMonth,
          ).toLowerCase()}. Guarda para crear este mes.
        </p>
      )}

      {error && (
        <div className="mt-4">
          <InlineNotice variant="danger">{error}</InlineNotice>
        </div>
      )}

      <section aria-labelledby="income-title" className="mt-8">
        <SectionTitle
          id="income-title"
          title="Ingresos"
          detail={`${incomes.length} ${incomes.length === 1 ? "ingreso" : "ingresos"}`}
          onAdd={addIncome}
          addLabel="Registrar ingreso"
        />
        <IncomeList
          incomes={incomes}
          currency={snapshot.currency}
          onAdd={addIncome}
          onEdit={(income) => setIncomeDraft({ ...income })}
        />
      </section>

      <section aria-labelledby="debt-title" className="mt-9">
        <SectionTitle
          id="debt-title"
          title="Créditos y tarjetas"
          detail={`${snapshot.obligations.length} ${snapshot.obligations.length === 1 ? "pago" : "pagos"}`}
        />
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Se actualizan desde tus productos. Ábrelos para corregir una cuota o un extracto.
        </p>
        <ObligationList obligations={snapshot.obligations} />
      </section>

      <section aria-labelledby="expenses-title" className="mt-9">
        <SectionTitle
          id="expenses-title"
          title="Otros gastos"
          detail={`${expenses.length} ${expenses.length === 1 ? "gasto" : "gastos"}`}
          onAdd={addExpense}
          addLabel="Añadir gasto"
        />
        <ExpenseList
          expenses={expenses}
          currency={snapshot.currency}
          onAdd={addExpense}
          onEdit={(expense) => setExpenseDraft({ ...expense })}
        />
      </section>

      <div className="mt-9 rounded-3xl bg-secondary/70 p-4">
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm text-muted-foreground">Total comprometido</span>
          <span className="tabular text-base font-semibold tracking-tight">
            {formatMoney(totals.totalOutflow, snapshot.currency)}
          </span>
        </div>
        <Button type="submit" className="mt-4 w-full" disabled={pending || !ready}>
          {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
          Guardar {formatMonthTitle(snapshot.month).toLowerCase()}
        </Button>
      </div>

      <IncomeEntrySheet
        value={incomeDraft}
        month={snapshot.month}
        disabled={pending}
        canDelete={Boolean(
          incomeDraft &&
            incomes.some((income) => income.clientId === incomeDraft.clientId),
        )}
        onChange={setIncomeDraft}
        onSave={commitIncome}
        onDelete={() => {
          if (!incomeDraft) return;
          setIncomes((current) =>
            current.filter((income) => income.clientId !== incomeDraft.clientId),
          );
          setIncomeDraft(null);
        }}
        onClose={() => setIncomeDraft(null)}
      />
      <ExpenseEntrySheet
        value={expenseDraft}
        disabled={pending}
        canDelete={Boolean(
          expenseDraft &&
            expenses.some((expense) => expense.clientId === expenseDraft.clientId),
        )}
        onChange={setExpenseDraft}
        onSave={commitExpense}
        onDelete={() => {
          if (!expenseDraft) return;
          setExpenses((current) =>
            current.filter((expense) => expense.clientId !== expenseDraft.clientId),
          );
          setExpenseDraft(null);
        }}
        onClose={() => setExpenseDraft(null)}
      />
    </form>
  );
}
