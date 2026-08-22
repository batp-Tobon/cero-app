import type { BudgetExpense, BudgetIncome } from "../types";

export interface EditableIncome extends BudgetIncome {
  clientId: string;
}

export interface EditableExpense extends BudgetExpense {
  clientId: string;
}
