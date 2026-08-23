"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { money } from "@/core/money";
import { requireBillingWriteAccess } from "@/features/billing/access";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import { isCalendarDate, todayISO } from "@/shared/lib/dates";
import { publicActionError } from "@/shared/lib/server-errors";
import type { ActionResult } from "@/shared/types/domain";

const colors = [
  "emerald",
  "sky",
  "violet",
  "rose",
  "amber",
  "orange",
  "teal",
  "indigo",
] as const;
const icons = [
  "car",
  "house",
  "building",
  "card",
  "wallet",
  "bank",
  "study",
  "travel",
  "health",
  "phone",
  "furniture",
  "work",
] as const;

const pocketSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre al bolsillo.").max(60),
  currency: z.string().trim().regex(/^[a-z]{3}$/i, "La moneda no es válida."),
  initialAmount: z.number().min(0, "El saldo inicial no puede ser negativo."),
  goalAmount: z.number().min(0, "La meta no puede ser negativa."),
  color: z.enum(colors),
  icon: z.enum(icons),
});

const movementSchema = z.object({
  pocketId: z.string().uuid("El bolsillo no es válido."),
  kind: z.enum(["deposit", "withdrawal"]),
  amount: z.number().positive("El valor debe ser mayor que cero."),
  movementDate: z
    .string()
    .refine(isCalendarDate, "La fecha no es válida.")
    .refine((date) => date <= todayISO(), "La fecha no puede estar en el futuro."),
  description: z.string().trim().max(120).optional(),
});

export type CreateSavingsPocketInput = z.input<typeof pocketSchema>;
export type RegisterSavingsMovementInput = z.input<typeof movementSchema>;

export async function createSavingsPocket(
  input: CreateSavingsPocketInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = pocketSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const billing = await requireBillingWriteAccess();
  if (!billing.ok) return billing;
  if (!(await getCurrentUser())) return { ok: false, error: "Tu sesión expiró." };

  const value = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_savings_pocket", {
    p_name: value.name,
    p_currency: value.currency.toUpperCase(),
    p_initial_amount: money(value.initialAmount),
    p_goal_amount: value.goalAmount > 0 ? money(value.goalAmount) : null,
    p_color: value.color,
    p_icon: value.icon,
  });

  if (error || !data) {
    const limitReached = error?.message.includes("limit reached");
    return {
      ok: false,
      error: limitReached
        ? "Puedes tener hasta 20 bolsillos activos."
        : publicActionError(
            "savings.create-pocket",
            error,
            "No pudimos crear el bolsillo.",
          ),
    };
  }

  revalidateSavings();
  return { ok: true, data: { id: data } };
}

export async function registerSavingsMovement(
  input: RegisterSavingsMovementInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };

  const billing = await requireBillingWriteAccess();
  if (!billing.ok) return billing;
  if (!(await getCurrentUser())) return { ok: false, error: "Tu sesión expiró." };

  const value = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("register_savings_movement", {
    p_pocket_id: value.pocketId,
    p_kind: value.kind,
    p_amount: money(value.amount),
    p_movement_date: value.movementDate,
    p_description: value.description || null,
  });

  if (error || !data) {
    const exceedsBalance = error?.message.includes("exceeds savings balance");
    return {
      ok: false,
      error: exceedsBalance
        ? "El retiro supera el saldo disponible del bolsillo."
        : publicActionError(
            "savings.register-movement",
            error,
            "No pudimos registrar el movimiento.",
          ),
    };
  }

  revalidateSavings();
  return { ok: true, data: { id: data } };
}

function revalidateSavings() {
  revalidatePath("/ahorros");
  revalidatePath("/inicio");
}
