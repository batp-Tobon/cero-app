import {
  ArrowDownToLine,
  GraduationCap,
  HeartPulse,
  Home,
  ReceiptText,
  ShoppingBasket,
  Sparkles,
  Users,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { BudgetExpenseCategory } from "../types";

export interface BudgetCategoryOption {
  value: BudgetExpenseCategory;
  label: string;
  icon: LucideIcon;
}

export const BUDGET_CATEGORIES: BudgetCategoryOption[] = [
  { value: "housing", label: "Vivienda", icon: Home },
  { value: "food", label: "Comida", icon: Utensils },
  { value: "utilities", label: "Servicios", icon: ReceiptText },
  { value: "transport", label: "Transporte", icon: ArrowDownToLine },
  { value: "health", label: "Salud", icon: HeartPulse },
  { value: "education", label: "Educación", icon: GraduationCap },
  { value: "family", label: "Familia", icon: Users },
  { value: "leisure", label: "Ocio", icon: Sparkles },
  { value: "other", label: "Otro", icon: ShoppingBasket },
];

export function getBudgetCategory(
  value: BudgetExpenseCategory,
): BudgetCategoryOption {
  return (
    BUDGET_CATEGORIES.find((category) => category.value === value) ??
    BUDGET_CATEGORIES[BUDGET_CATEGORIES.length - 1]
  );
}
