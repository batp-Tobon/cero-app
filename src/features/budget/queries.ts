import "server-only";

import { createClient, getCurrentProfile, getCurrentUser } from "@/infrastructure/supabase/server";
import { getCreditSummaries } from "@/features/credits/queries";
import { getRevolvingSummaries } from "@/features/revolving/queries";
import { addMonths, todayISO } from "@/shared/lib/dates";
import { env } from "@/shared/lib/env";
import type {
  BudgetIncomeRow,
  BudgetExpenseRow,
  MonthlyBudgetRow,
  RevolvingStatementRow,
  ScheduleRowDB,
} from "@/shared/types/database";
import type {
  BudgetExpense,
  BudgetIncome,
  BudgetSnapshot,
  DebtObligation,
  ObligationStatus,
} from "./types";

function obligationStatus(
  status: "pending" | "partial" | "paid" | "open" | "overdue",
  dueDate: string,
): ObligationStatus {
  if (status === "paid") return "paid";
  if (status === "partial") return "partial";
  return status === "overdue" || dueDate < todayISO() ? "overdue" : "pending";
}

function toExpense(row: BudgetExpenseRow, projected: boolean): BudgetExpense {
  return {
    id: projected ? `projected:${row.id}` : row.id,
    name: row.name,
    category: row.category,
    amount: Number(row.amount),
    dueDay: row.due_day,
    recurring: row.recurring,
  };
}

function monthDistance(from: string, to: string): number {
  const fromIndex = Number(from.slice(0, 4)) * 12 + Number(from.slice(5, 7));
  const toIndex = Number(to.slice(0, 4)) * 12 + Number(to.slice(5, 7));
  return toIndex - fromIndex;
}

function toIncome(
  row: BudgetIncomeRow,
  projected: boolean,
  targetMonth: string,
): BudgetIncome {
  return {
    id: projected ? `projected:${row.id}` : row.id,
    name: row.name,
    amount: Number(row.amount),
    receivedDate: projected
      ? addMonths(row.received_date, monthDistance(row.month, targetMonth))
      : row.received_date,
    recurring: row.recurring,
  };
}

/**
 * Presupuesto de un mes. Si aún no existe, proyecta sólo los ingresos y
 * gastos marcados como recurrentes; la proyección no escribe nada hasta
 * que la persona pulse Guardar.
 */
export async function getBudgetSnapshot(month: string): Promise<BudgetSnapshot> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Tu sesión expiró.");

  const nextMonth = addMonths(month, 1);
  const supabase = await createClient();

  const [budgetRes, scheduleRes, statementRes, credits, accounts, profile] =
    await Promise.all([
      supabase
        .from("monthly_budgets")
        .select("*")
        .eq("user_id", user.id)
        .lte("month", month)
        .order("month", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("credit_schedule")
        .select("id,credit_id,due_date,payment_amount,paid_amount,status")
        .gte("due_date", month)
        .lt("due_date", nextMonth)
        .order("due_date", { ascending: true }),
      supabase
        .from("revolving_statements")
        .select("id,account_id,due_date,total_due,paid_amount,status")
        .gte("due_date", month)
        .lt("due_date", nextMonth)
        .order("due_date", { ascending: true }),
      getCreditSummaries(),
      getRevolvingSummaries(),
      getCurrentProfile(),
    ]);

  if (budgetRes.error) throw new Error(budgetRes.error.message);
  if (scheduleRes.error) throw new Error(scheduleRes.error.message);
  if (statementRes.error) throw new Error(statementRes.error.message);

  const sourceBudget = budgetRes.data as MonthlyBudgetRow | null;
  const projected = sourceBudget != null && sourceBudget.month !== month;
  let incomeRows: BudgetIncomeRow[] = [];
  let expenseRows: BudgetExpenseRow[] = [];

  if (sourceBudget) {
    const [incomesRes, expensesRes] = await Promise.all([
      supabase
        .from("budget_incomes")
        .select("*")
        .eq("budget_id", sourceBudget.id)
        .order("position", { ascending: true })
        .order("received_date", { ascending: true }),
      supabase
        .from("budget_expenses")
        .select("*")
        .eq("budget_id", sourceBudget.id)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true }),
    ]);
    if (incomesRes.error) throw new Error(incomesRes.error.message);
    if (expensesRes.error) throw new Error(expensesRes.error.message);
    incomeRows = incomesRes.data ?? [];
    expenseRows = expensesRes.data ?? [];
  }

  const creditById = new Map(credits.map((credit) => [credit.id, credit]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  type ScheduleDue = Pick<
    ScheduleRowDB,
    "id" | "credit_id" | "due_date" | "payment_amount" | "paid_amount" | "status"
  >;
  type StatementDue = Pick<
    RevolvingStatementRow,
    "id" | "account_id" | "due_date" | "total_due" | "paid_amount" | "status"
  >;

  const creditObligations = ((scheduleRes.data ?? []) as ScheduleDue[])
    .map((row): DebtObligation | null => {
      const credit = creditById.get(row.credit_id);
      if (!credit) return null;
      return {
        id: `credit:${row.id}`,
        kind: "credit",
        productId: credit.id,
        name: credit.name,
        dueDate: row.due_date,
        amount: Number(row.payment_amount),
        paidAmount: Number(row.paid_amount),
        currency: credit.currency,
        color: credit.color,
        icon: credit.icon,
        status: obligationStatus(row.status, row.due_date),
        href: `/creditos/${credit.id}`,
      };
    })
    .filter((item): item is DebtObligation => item != null);

  const revolvingObligations = ((statementRes.data ?? []) as StatementDue[])
    .map((row): DebtObligation | null => {
      const account = accountById.get(row.account_id);
      if (!account) return null;
      return {
        id: `revolving:${row.id}`,
        kind: "revolving",
        productId: account.id,
        name: account.name,
        dueDate: row.due_date,
        amount: Number(row.total_due),
        paidAmount: Number(row.paid_amount),
        currency: account.currency,
        color: account.color,
        icon: account.icon,
        status: obligationStatus(row.status, row.due_date),
        href: `/tarjetas/${account.id}`,
      };
    })
    .filter((item): item is DebtObligation => item != null);

  return {
    month,
    source: sourceBudget ? (projected ? "projected" : "saved") : "empty",
    sourceMonth: sourceBudget?.month ?? null,
    incomes: incomeRows
      .filter((income) => !projected || income.recurring)
      .map((income) => toIncome(income, projected, month)),
    currency: sourceBudget?.currency ?? profile?.currency ?? env.defaultCurrency,
    expenses: expenseRows
      .filter((expense) => !projected || expense.recurring)
      .map((expense) => toExpense(expense, projected)),
    obligations: [...creditObligations, ...revolvingObligations].sort((a, b) =>
      a.dueDate.localeCompare(b.dueDate),
    ),
  };
}
