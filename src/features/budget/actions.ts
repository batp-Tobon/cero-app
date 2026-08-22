"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { money } from "@/core/money";
import { requireBillingWriteAccess } from "@/features/billing/access";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import type { ActionResult } from "@/shared/types/domain";
import { isCalendarDate } from "@/shared/lib/dates";
import { publicActionError } from "@/shared/lib/server-errors";

const categories = [
  "housing",
  "food",
  "utilities",
  "transport",
  "health",
  "education",
  "family",
  "leisure",
  "other",
] as const;

const budgetSchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])-01$/, "El mes no es válido."),
  currency: z
    .string()
    .trim()
    .regex(/^[a-z]{3}$/i, "La moneda debe tener tres letras."),
  incomes: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Ponle un nombre al ingreso.").max(80),
        amount: z.number().positive("Cada ingreso debe ser mayor que cero."),
        receivedDate: z
          .string()
          .regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/, "La fecha del ingreso no es válida.")
          .refine(isCalendarDate, "La fecha del ingreso no es válida."),
        recurring: z.boolean(),
      }),
    )
    .max(50, "Puedes guardar hasta 50 ingresos por mes."),
  expenses: z
    .array(
      z.object({
        name: z.string().trim().min(1, "Ponle un nombre al gasto.").max(80),
        category: z.enum(categories),
        amount: z.number().positive("Cada gasto debe ser mayor que cero."),
        dueDay: z.number().int().min(1).max(31),
        recurring: z.boolean(),
      }),
    )
    .max(100, "Puedes guardar hasta 100 gastos por mes."),
}).superRefine((value, context) => {
  const nextMonth = new Date(`${value.month}T00:00:00Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const end = nextMonth.toISOString().slice(0, 10);

  value.incomes.forEach((income, index) => {
    if (income.receivedDate < value.month || income.receivedDate >= end) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["incomes", index, "receivedDate"],
        message: "La fecha del ingreso debe pertenecer al mes elegido.",
      });
    }
  });
});

export type SaveBudgetInput = z.input<typeof budgetSchema>;

/** Guarda ingresos fechados y gastos de forma atómica mediante un RPC invoker. */
export async function saveMonthlyBudget(
  input: SaveBudgetInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = budgetSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }

  const billing = await requireBillingWriteAccess();
  if (!billing.ok) return billing;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const value = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_monthly_budget_v2", {
    p_month: value.month,
    p_currency: value.currency.toUpperCase(),
    p_incomes: value.incomes.map((income, position) => ({
      name: income.name.trim(),
      amount: money(income.amount),
      received_date: income.receivedDate,
      recurring: income.recurring,
      position,
    })),
    p_expenses: value.expenses.map((expense, position) => ({
      name: expense.name.trim(),
      category: expense.category,
      amount: money(expense.amount),
      due_day: expense.dueDay,
      recurring: expense.recurring,
      position,
    })),
  });

  if (error || !data) {
    return {
      ok: false,
      error: publicActionError(
        "budget.save",
        error,
        "No pudimos guardar el presupuesto.",
      ),
    };
  }

  revalidatePath("/presupuesto");
  return { ok: true, data: { id: data } };
}
