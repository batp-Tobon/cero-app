"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import { money } from "@/core/money";
import { formatMoney } from "@/shared/lib/format";
import type { ActionResult } from "@/shared/types/domain";
import { requireBillingWriteAccess } from "@/features/billing/access";
import {
  removeReceipt,
  uploadReceipt,
} from "@/features/receipts/server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function revalidateRevolving(accountId?: string) {
  revalidatePath("/inicio");
  revalidatePath("/creditos");
  if (accountId) revalidatePath(`/tarjetas/${accountId}`);
  revalidatePath("/actividad");
  revalidatePath("/presupuesto");
}

function receiptFile(data?: FormData): File | null {
  const value = data?.get("receipt");
  return value instanceof File && value.size > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// Alta y edición de la cuenta
// ---------------------------------------------------------------------------

const accountSchema = z.object({
  name: z.string().trim().min(1, "Ponle un nombre a la tarjeta.").max(80),
  kind: z.enum(["credit_card", "credit_line"]).default("credit_card"),
  entity: z.string().trim().max(80).optional().nullable(),
  lastFour: z
    .string()
    .trim()
    .regex(/^\d{4}$/, "Son los cuatro últimos dígitos.")
    .optional()
    .or(z.literal("")),
  creditLimit: z.number().positive("El cupo debe ser mayor que cero."),
  interestRateMonthly: z.number().min(0).max(99).default(0),
  statementDay: z.number().int().min(1).max(31).default(1),
  dueDay: z.number().int().min(1).max(31).default(1),
  currency: z.string().trim().length(3).default("COP"),
  /** Saldo ya utilizado al dar de alta la tarjeta. */
  openingBalance: z.number().min(0).default(0),
  notes: z.string().trim().max(500).optional().nullable(),
});

type RevolvingAccountInput = z.input<typeof accountSchema>;

/**
 * Crea una tarjeta o cupo rotativo.
 *
 * El saldo inicial se registra como un movimiento de cargo, no como una
 * columna: así el saldo siempre sale de la suma de movimientos y no hay dos
 * fuentes de verdad que puedan discrepar.
 */
export async function createRevolvingAccount(
  input: RevolvingAccountInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const billing = await requireBillingWriteAccess();
  if (!billing.ok) return billing;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  if (value.openingBalance > value.creditLimit) {
    return {
      ok: false,
      error: `El saldo usado no puede superar el cupo (${formatMoney(
        value.creditLimit,
        value.currency,
      )}).`,
    };
  }

  const supabase = await createClient();

  const { data: account, error } = await supabase
    .from("revolving_accounts")
    .insert({
      owner_id: user.id,
      name: value.name,
      kind: value.kind,
      entity: value.entity?.trim() || null,
      last_four: value.lastFour ? value.lastFour : null,
      credit_limit: money(value.creditLimit),
      interest_rate_monthly: value.interestRateMonthly / 100,
      statement_day: value.statementDay,
      due_day: value.dueDay,
      currency: value.currency,
      status: "active",
      notes: value.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (error || !account) {
    return { ok: false, error: error?.message ?? "No pudimos crear la tarjeta." };
  }

  if (value.openingBalance > 0) {
    const { error: movementError } = await supabase
      .from("revolving_movements")
      .insert({
        account_id: account.id,
        user_id: user.id,
        kind: "charge",
        amount: money(value.openingBalance),
        description: "Saldo al registrar la tarjeta",
      });
    if (movementError) {
      await supabase.from("revolving_accounts").delete().eq("id", account.id);
      return { ok: false, error: movementError.message };
    }
  }

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: null,
    payment_id: null,
    type: "credit_created",
    title: "Tarjeta registrada",
    description: `${value.name} · cupo ${formatMoney(
      value.creditLimit,
      value.currency,
    )}`,
    amount: value.openingBalance || null,
  });

  revalidateRevolving();
  return { ok: true, data: { id: account.id } };
}

const colorSchema = z.enum(["emerald", "sky", "violet", "rose", "amber", "orange", "teal", "indigo"]);
const iconSchema = z.enum([
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
]);

const updateAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  entity: z.string().trim().max(80).optional().nullable(),
  creditLimit: z.number().positive(),
  statementDay: z.number().int().min(1).max(31),
  dueDay: z.number().int().min(1).max(31),
  interestRateMonthly: z.number().min(0).max(99),
  notes: z.string().trim().max(500).optional().nullable(),
  color: colorSchema,
  icon: iconSchema.nullable().optional(),
});

export async function updateRevolvingAccount(
  input: z.input<typeof updateAccountSchema>,
): Promise<ActionResult> {
  const parsed = updateAccountSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const billing = await requireBillingWriteAccess();
  if (!billing.ok) return billing;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("revolving_accounts")
    .update({
      name: value.name,
      entity: value.entity?.trim() || null,
      credit_limit: money(value.creditLimit),
      statement_day: value.statementDay,
      due_day: value.dueDay,
      interest_rate_monthly: value.interestRateMonthly / 100,
      notes: value.notes?.trim() || null,
      color: value.color,
      icon: value.icon ?? null,
    })
    .eq("id", value.id);

  if (error) return { ok: false, error: error.message };

  revalidateRevolving(value.id);
  return { ok: true, data: undefined };
}

export async function deleteRevolvingAccount(
  id: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const { data: account } = await supabase
    .from("revolving_accounts")
    .select("name")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase
    .from("revolving_accounts")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: null,
    payment_id: null,
    type: "credit_deleted",
    title: "Tarjeta eliminada",
    description: account?.name ?? null,
    amount: null,
  });

  revalidateRevolving();
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------------

const movementSchema = z.object({
  accountId: z.string().uuid(),
  kind: z.enum(["charge", "payment", "interest", "fee"]),
  amount: z.number().positive("El importe debe ser mayor que cero."),
  movementDate: z.string().regex(ISO_DATE, "Elige la fecha."),
  description: z.string().trim().max(120).optional().nullable(),
  installmentCount: z.number().int().min(1).max(60).default(1),
});

export type MovementInput = z.input<typeof movementSchema>;

const MOVEMENT_LABEL: Record<MovementInput["kind"], string> = {
  charge: "Compra",
  payment: "Pago",
  interest: "Intereses",
  fee: "Cuota de manejo",
};

/** Registra una compra, un pago, intereses o una cuota de manejo. */
export async function registerMovement(
  input: MovementInput,
  receiptData?: FormData,
): Promise<ActionResult<{ balance: number; available: number }>> {
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const billing = await requireBillingWriteAccess();
  if (!billing.ok) return billing;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  const { data: summary, error: summaryError } = await supabase
    .from("revolving_summary")
    .select("*")
    .eq("id", value.accountId)
    .maybeSingle();

  if (summaryError) return { ok: false, error: summaryError.message };
  if (!summary) return { ok: false, error: "No encontramos esa tarjeta." };

  const balance = Number(summary.balance);

  if (value.kind === "payment" && value.amount > balance + 0.009) {
    return {
      ok: false,
      error: `El pago supera el saldo usado (${formatMoney(
        balance,
        summary.currency,
      )}).`,
    };
  }
  if (value.kind !== "payment") {
    const available = Number(summary.available);
    if (value.amount > available + 0.009) {
      return {
        ok: false,
        error: `Supera el cupo disponible (${formatMoney(
          available,
          summary.currency,
        )}).`,
      };
    }
  }

  const receipt = await uploadReceipt(
    supabase,
    user.id,
    "cards",
    value.accountId,
    receiptFile(receiptData),
  );

  const { data: movement, error } = await supabase
    .from("revolving_movements")
    .insert({
      account_id: value.accountId,
      user_id: user.id,
      kind: value.kind,
      amount: money(value.amount),
      movement_date: value.movementDate,
      description: value.description?.trim() || null,
      installment_count: value.kind === "charge" ? value.installmentCount : 1,
      installments_paid: 0,
      ...(receipt ?? {}),
    })
    .select("id")
    .single();

  if (error || !movement) {
    await removeReceipt(supabase, receipt?.receipt_path);
    return { ok: false, error: error?.message ?? "No pudimos registrar el movimiento." };
  }

  const delta = value.kind === "payment" ? -value.amount : value.amount;
  const newBalance = money(Math.max(0, balance + delta));

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: null,
    payment_id: null,
    revolving_movement_id: movement.id,
    type: value.kind === "payment" ? "payment" : "credit_updated",
    title: `${MOVEMENT_LABEL[value.kind]} · ${summary.name}`,
    description: value.description?.trim() || null,
    amount: money(value.amount),
    occurred_at: new Date(`${value.movementDate}T12:00:00Z`).toISOString(),
    metadata: {
      revolving_account: value.accountId,
      kind: value.kind,
      installment_count: value.kind === "charge" ? value.installmentCount : 1,
      has_receipt: Boolean(receipt),
    },
  });

  revalidateRevolving(value.accountId);

  return {
    ok: true,
    data: {
      balance: newBalance,
      available: money(Math.max(0, Number(summary.credit_limit) - newBalance)),
    },
  };
}


/**
 * Elimina un movimiento mal registrado.
 *
 * No hace falta recalcular nada: el saldo de una tarjeta es la suma de sus
 * movimientos, así que quitar uno lo corrige solo.
 */
export async function deleteMovement(
  movementId: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();
  const { data: movement } = await supabase
    .from("revolving_movements")
    .select("account_id, receipt_path")
    .eq("id", movementId)
    .maybeSingle();

  if (!movement) return { ok: false, error: "No encontramos ese movimiento." };

  const { error } = await supabase
    .from("revolving_movements")
    .delete()
    .eq("id", movementId);

  if (error) return { ok: false, error: error.message };

  await removeReceipt(supabase, movement.receipt_path);

  revalidateRevolving(movement.account_id);
  return { ok: true, data: undefined };
}

// ---------------------------------------------------------------------------
// Extracto
// ---------------------------------------------------------------------------

const statementSchema = z.object({
  accountId: z.string().uuid(),
  statementDate: z.string().regex(ISO_DATE, "Elige la fecha de corte."),
  dueDate: z.string().regex(ISO_DATE, "Elige la fecha límite de pago."),
  totalDue: z.number().min(0),
  minimumDue: z.number().min(0),
  reducedMinimumDue: z.number().min(0).optional().nullable(),
});

type StatementInput = z.input<typeof statementSchema>;

/**
 * Guarda el extracto del corte: total a pagar, mínimo y fecha límite.
 * Son cifras que decide el banco, no la app, así que se registran tal cual
 * vienen en vez de intentar calcularlas.
 */
export async function registerStatement(
  input: StatementInput,
): Promise<ActionResult> {
  const parsed = statementSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  if (value.dueDate < value.statementDate) {
    return {
      ok: false,
      error: "La fecha límite de pago no puede ser anterior al corte.",
    };
  }
  if (value.minimumDue > value.totalDue) {
    return {
      ok: false,
      error: "El mínimo no puede ser mayor que el total a pagar.",
    };
  }

  const billing = await requireBillingWriteAccess();
  if (!billing.ok) return billing;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  const { error } = await supabase.from("revolving_statements").upsert(
    {
      account_id: value.accountId,
      statement_date: value.statementDate,
      due_date: value.dueDate,
      total_due: money(value.totalDue),
      minimum_due: money(value.minimumDue),
      reduced_minimum_due:
        value.reducedMinimumDue != null ? money(value.reducedMinimumDue) : null,
      status: "open",
    },
    { onConflict: "account_id,statement_date" },
  );

  if (error) return { ok: false, error: error.message };

  revalidateRevolving(value.accountId);
  return { ok: true, data: undefined };
}
