"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDollarSign,
  Loader2,
} from "lucide-react";
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

  /**
   * Guardados en cola, uno detrás de otro.
   *
   * El RPC reemplaza el mes entero, así que dos peticiones en vuelo podrían
   * llegar al revés y dejar escrito el estado viejo. Encadenarlas garantiza
   * que la última en salir es la última en escribir.
   */
  const queue = React.useRef<Promise<void>>(Promise.resolve());
  /** Lo último que se intentó guardar, para el botón de reintentar. */
  const lastAttempt = React.useRef<{
    incomes: EditableIncome[];
    expenses: EditableExpense[];
  } | null>(null);

  const persist = React.useCallback(
    (nextIncomes: EditableIncome[], nextExpenses: EditableExpense[]) => {
      lastAttempt.current = { incomes: nextIncomes, expenses: nextExpenses };
      setPending(true);
      setError(null);
      queue.current = queue.current.then(async () => {
        const result = await saveMonthlyBudget({
          // El mes es el que se está viendo, no el de hoy: registrar en
          // septiembre desde agosto tiene que quedar en septiembre.
          month: snapshot.month,
          currency: snapshot.currency,
          incomes: nextIncomes.map(({ name, amount, receivedDate, recurring }) => ({
            name,
            amount,
            receivedDate,
            recurring,
          })),
          expenses: nextExpenses.map(
            ({ name, category, amount, dueDate, recurring }) => ({
              name,
              category,
              amount,
              dueDate,
              recurring,
            }),
          ),
        });
        setPending(false);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setError(null);
        router.refresh();
      });
    },
    [router, snapshot.month, snapshot.currency],
  );

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
      dueDate: snapshot.month,
      recurring: true,
    });
  }

  /** Inserta o reemplaza una entrada según si ya estaba en la lista. */
  function upsert<T extends { clientId: string }>(list: T[], entry: T): T[] {
    return list.some((item) => item.clientId === entry.clientId)
      ? list.map((item) => (item.clientId === entry.clientId ? entry : item))
      : [...list, entry];
  }

  function commitIncome() {
    if (!incomeDraft) return;
    const next = upsert(incomes, incomeDraft);
    setIncomes(next);
    setIncomeDraft(null);
    persist(next, expenses);
  }

  function commitExpense() {
    if (!expenseDraft) return;
    const next = upsert(expenses, expenseDraft);
    setExpenses(next);
    setExpenseDraft(null);
    persist(incomes, next);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || pending) return;
    persist(incomes, expenses);
  }

  // El mes proyectado es el único que necesita un botón: sus cifras son una
  // copia del mes anterior que todavía no existe en la base, y quien la da
  // por buena sin tocar nada no dispara ningún guardado.
  const needsConfirmation = snapshot.source === "projected";

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
          ).toLowerCase()}. Confírmalos abajo o edita algo para crear este mes.
        </p>
      )}

      {error && (
        <div className="mt-4 space-y-2">
          <InlineNotice variant="danger">{error}</InlineNotice>
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={pending}
            onClick={() => {
              const attempt = lastAttempt.current;
              if (attempt) persist(attempt.incomes, attempt.expenses);
            }}
          >
            Reintentar
          </Button>
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

        {needsConfirmation ? (
          <Button type="submit" className="mt-4 w-full" disabled={pending || !ready}>
            {pending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : (
              <Check aria-hidden />
            )}
            Confirmar {formatMonthTitle(snapshot.month).toLowerCase()}
          </Button>
        ) : (
          <p
            aria-live="polite"
            className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground"
          >
            {pending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              <>
                <Check className="h-3.5 w-3.5 text-primary" aria-hidden />
                Se guarda solo en {formatMonthTitle(snapshot.month).toLowerCase()}
              </>
            )}
          </p>
        )}
      </div>

      {/* Las hojas no se bloquean mientras guarda: la cola ya ordena las
          escrituras y cada envío lleva el estado completo, así que encadenar
          dos altas seguidas es seguro. Bloquear solo añadiría una espera. */}
      <IncomeEntrySheet
        value={incomeDraft}
        month={snapshot.month}
        disabled={false}
        canDelete={Boolean(
          incomeDraft &&
            incomes.some((income) => income.clientId === incomeDraft.clientId),
        )}
        onChange={setIncomeDraft}
        onSave={commitIncome}
        onDelete={() => {
          if (!incomeDraft) return;
          const next = incomes.filter(
            (income) => income.clientId !== incomeDraft.clientId,
          );
          setIncomes(next);
          setIncomeDraft(null);
          persist(next, expenses);
        }}
        onClose={() => setIncomeDraft(null)}
      />
      <ExpenseEntrySheet
        month={snapshot.month}
        value={expenseDraft}
        disabled={false}
        canDelete={Boolean(
          expenseDraft &&
            expenses.some((expense) => expense.clientId === expenseDraft.clientId),
        )}
        onChange={setExpenseDraft}
        onSave={commitExpense}
        onDelete={() => {
          if (!expenseDraft) return;
          const next = expenses.filter(
            (expense) => expense.clientId !== expenseDraft.clientId,
          );
          setExpenses(next);
          setExpenseDraft(null);
          persist(incomes, next);
        }}
        onClose={() => setExpenseDraft(null)}
      />
    </form>
  );
}
