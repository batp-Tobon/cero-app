import { money } from "./money";

export interface BudgetAmount {
  amount: number;
}

export interface BudgetTotals {
  income: number;
  expenses: number;
  debtPayments: number;
  totalOutflow: number;
  remaining: number;
  committedPercent: number;
}

/**
 * Resume un mes sin saber nada de React ni de la base de datos. Créditos,
 * tarjetas y gastos manuales llegan como importes: la procedencia no cambia
 * la aritmética y queda fuera del dominio puro.
 */
export function calculateBudget(
  incomes: BudgetAmount[],
  expenses: BudgetAmount[],
  debtPayments: BudgetAmount[],
): BudgetTotals {
  const safeIncome = money(
    incomes.reduce((sum, item) => sum + Math.max(0, item.amount), 0),
  );
  const expenseTotal = money(
    expenses.reduce((sum, item) => sum + Math.max(0, item.amount), 0),
  );
  const debtTotal = money(
    debtPayments.reduce((sum, item) => sum + Math.max(0, item.amount), 0),
  );
  const totalOutflow = money(expenseTotal + debtTotal);

  return {
    income: safeIncome,
    expenses: expenseTotal,
    debtPayments: debtTotal,
    totalOutflow,
    remaining: money(safeIncome - totalOutflow),
    committedPercent: safeIncome
      ? Math.max(0, (totalOutflow / safeIncome) * 100)
      : totalOutflow > 0
        ? 100
        : 0,
  };
}
