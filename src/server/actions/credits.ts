"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import { rebuildCreditSchedule } from "@/server/services/schedule";
import { creditTypeLabel } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/types/domain";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const creditSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre al crédito.").max(80),
  type: z.enum(["vehicle", "property", "card", "free_investment", "other"]),
  entity: z.string().trim().max(80).optional().nullable(),
  principalAmount: z
    .number()
    .positive("El monto debe ser mayor que cero.")
    .max(1e14),
  // Se recibe en porcentaje (1,89) y se guarda en decimal (0.0189).
  interestRateMonthly: z
    .number()
    .min(0, "La tasa no puede ser negativa.")
    .max(99, "Revisa la tasa: parece demasiado alta."),
  termMonths: z
    .number()
    .int("El plazo va en meses completos.")
    .min(1, "El plazo mínimo es 1 mes.")
    .max(600, "El plazo máximo es 600 meses."),
  amortizationSystem: z.enum([
    "french",
    "german",
    "american",
    "zero_interest",
  ]),
  extraPrincipalMode: z
    .enum(["reduce_term", "reduce_installment"])
    .default("reduce_term"),
  firstPaymentDate: z.string().regex(ISO_DATE, "Elige la fecha de la primera cuota."),
  currency: z.string().trim().length(3).default("COP"),
  notes: z.string().trim().max(500).optional().nullable(),
});

export type CreditInput = z.input<typeof creditSchema>;

/**
 * Crea el crédito y su plan de pagos en un solo flujo.
 * El cronograma NO se calcula en el navegador: aquí, en el servidor, es donde
 * se decide cuánto debe el usuario.
 */
export async function createCredit(
  input: CreditInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = creditSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const rate = value.interestRateMonthly / 100;

  const { data: credit, error } = await supabase
    .from("credits")
    .insert({
      owner_id: user.id,
      name: value.name,
      type: value.type,
      entity: value.entity?.trim() || null,
      principal_amount: value.principalAmount,
      interest_rate_monthly: rate,
      term_months: value.termMonths,
      amortization_system: value.amortizationSystem,
      extra_principal_mode: value.extraPrincipalMode,
      first_payment_date: value.firstPaymentDate,
      currency: value.currency,
      status: "active",
      notes: value.notes?.trim() || null,
    })
    .select("*")
    .single();

  if (error || !credit) {
    return { ok: false, error: error?.message ?? "No pudimos crear el crédito." };
  }

  // Sin pagos todavía, la reconstrucción produce exactamente el plan original.
  // Usar la misma función que el resto de operaciones evita que existan dos
  // caminos distintos para generar un cronograma.
  try {
    await rebuildCreditSchedule(supabase, credit);
  } catch (e) {
    // Sin plan de pagos el crédito no sirve de nada: se deshace la creación
    // para no dejar un registro a medias.
    await supabase.from("credits").delete().eq("id", credit.id);
    return {
      ok: false,
      error:
        e instanceof Error
          ? `No pudimos generar el plan de pagos: ${e.message}`
          : "No pudimos generar el plan de pagos.",
    };
  }

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: credit.id,
    payment_id: null,
    type: "credit_created",
    title: "Crédito creado",
    description: `${value.name} · ${creditTypeLabel(value.type)} · ${formatMoney(
      value.principalAmount,
      value.currency,
    )}`,
    amount: value.principalAmount,
  });

  revalidatePath("/inicio");
  revalidatePath("/creditos");
  revalidatePath("/actividad");

  return { ok: true, data: { id: credit.id } };
}

const updateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  entity: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  extraPrincipalMode: z.enum(["reduce_term", "reduce_installment"]),
});

/**
 * Edita los datos descriptivos del crédito.
 * Monto, tasa y plazo NO se tocan aquí: cambiarlos invalidaría los pagos ya
 * registrados. Para eso hay que crear otro crédito.
 */
export async function updateCredit(
  input: z.input<typeof updateSchema>,
): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("credits")
    .update({
      name: value.name,
      entity: value.entity?.trim() || null,
      notes: value.notes?.trim() || null,
      extra_principal_mode: value.extraPrincipalMode,
    })
    .eq("id", value.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: value.id,
    payment_id: null,
    type: "credit_updated",
    title: "Crédito actualizado",
    description: value.name,
    amount: null,
  });

  revalidatePath("/creditos");
  revalidatePath(`/creditos/${value.id}`);
  revalidatePath("/actividad");

  return { ok: true, data: undefined };
}

/** Borra el crédito con su plan, sus pagos y su actividad (cascada en la BD). */
export async function deleteCredit(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const { data: credit } = await supabase
    .from("credits")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("credits").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  // La actividad del crédito se va en cascada; esta entrada queda suelta
  // (credit_id nulo) para que el borrado deje rastro.
  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: null,
    payment_id: null,
    type: "credit_deleted",
    title: "Crédito eliminado",
    description: credit?.name ?? null,
    amount: null,
  });

  revalidatePath("/inicio");
  revalidatePath("/creditos");
  revalidatePath("/actividad");

  return { ok: true, data: undefined };
}
