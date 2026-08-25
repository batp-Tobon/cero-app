import type {
  BudgetExpenseCategoryDB,
  InstallmentStatusDB,
} from "@/shared/types/database";

export type BudgetExpenseCategory = BudgetExpenseCategoryDB;

export interface BudgetIncome {
  id: string;
  name: string;
  amount: number;
  receivedDate: string;
  recurring: boolean;
}

export interface BudgetExpense {
  id: string;
  name: string;
  category: BudgetExpenseCategory;
  amount: number;
  /** Fecha concreta del gasto, no un día suelto del mes. */
  dueDate: string;
  recurring: boolean;
}

export type ObligationStatus = InstallmentStatusDB | "overdue";

export interface DebtObligation {
  id: string;
  kind: "credit" | "revolving";
  productId: string;
  name: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  currency: string;
  color: string;
  icon: string | null;
  status: ObligationStatus;
  href: string;
}

export interface BudgetSnapshot {
  month: string;
  source: "saved" | "projected" | "empty";
  sourceMonth: string | null;
  incomes: BudgetIncome[];
  currency: string;
  expenses: BudgetExpense[];
  obligations: DebtObligation[];
}
