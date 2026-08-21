"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import {
  loadCredit,
  money,
  rebuildCreditSchedule,
  type RebuildResult,
} from "@/server/services/schedule";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/types/domain";
import type { CreditRow } from "@/types/database";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Ventana en la que dos movimientos idénticos se consideran un doble envío. */
const DUPLICATE_WINDOW_MS = 30_000;

function revalidateCredit(creditId: string) {
  revalidatePath("/inicio");
  revalidatePath("/creditos");
  revalidatePath(`/creditos/${creditId}`);
  revalidatePath("/actividad");
}

/** Saldo vivo actual: el saldo inicial de la primera cuota sin pagar. */
async function currentBalance(
  db: Awaited<ReturnType<typeof createClient>>,
  credit: CreditRow,
): Promise<{ balance: number; interestDue: number; installment: number | null }> {
  const { data, error } = await db
    .from("credit_schedule")
    .select("installment_number, opening_balance, interest_amount")
    .eq("credit_id", credit.id)
    .neq("status", "paid")
    .order("installment_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return { balance: 0, interestDue: 0, installment: null };

  return {
    balance: Number(data.opening_balance),
    interestDue: Number(data.interest_amount),
    installment: data.installment_number,
  };
}

/** Frena el doble clic sin bloquear un segundo pago legítimo días después. */
async function isDuplicate(
  db: Awaited<ReturnType<typeof createClient>>,
  creditId: string,
  paymentDate: string,
  amountPaid: number,
  extraPrincipal: number,
): Promise<boolean> {
  const since = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
  const { data } = await db
    .from("payments")
    .select("id")
    .eq("credit_id", creditId)
    .eq("payment_date", paymentDate)
    .eq("amount_paid", money(amountPaid))
    .eq("extra_principal", money(extraPrincipal))
    .gte("created_at", since)
    .limit(1);
  return (data?.length ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Registrar pago de cuota
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  creditId: z.string().uuid(),
  paymentDate: z.string().regex(ISO_DATE, "Elige la fecha del pago."),
  amountPaid: z.number().positive("El valor pagado debe ser mayor que cero."),
  extraPrincipal: z.number().min(0).default(0),
  notes: z.string().trim().max(300).optional().nullable(),
});

export type PaymentInput = z.input<typeof paymentSchema>;

export interface PaymentResultData {
  newBalance: number;
  creditSettled: boolean;
  installmentsLeft: number;
}

/**
 * Registra el pago de una cuota.
 *
 * La cuota que salda NO viene del cliente: la asigna la reconstrucción según
 * el orden cronológico de los movimientos. Así un pago con fecha atrasada cae
 * donde le toca y no donde el formulario creyera.
 */
export async function registerPayment(
  input: PaymentInput,
): Promise<ActionResult<PaymentResultData>> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  try {
    const credit = await loadCredit(supabase, value.creditId);
    if (!credit) return { ok: false, error: "No encontramos ese crédito." };
    if (credit.status === "cancelled") {
      return { ok: false, error: "Este crédito está cancelado." };
    }

    const { balance, interestDue, installment } = await currentBalance(
      supabase,
      credit,
    );
    if (installment == null) {
      return { ok: false, error: "Este crédito ya está al día." };
    }

    const ceiling = money(balance + interestDue);
    if (money(value.amountPaid + value.extraPrincipal) > ceiling + 0.009) {
      return {
        ok: false,
        error: `El pago supera la deuda: como máximo puedes aplicar ${formatMoney(
          ceiling,
          credit.currency,
        )}.`,
      };
    }

    if (
      await isDuplicate(
        supabase,
        credit.id,
        value.paymentDate,
        value.amountPaid,
        value.extraPrincipal,
      )
    ) {
      return { ok: false, error: "Ese pago ya se acaba de registrar." };
    }

    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        credit_id: credit.id,
        user_id: user.id,
        installment_number: installment,
        payment_date: value.paymentDate,
        amount_paid: money(value.amountPaid),
        principal_paid: 0,
        interest_paid: 0,
        extra_principal: money(value.extraPrincipal),
        balance_after: null,
        notes: value.notes?.trim() || null,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    const result = await rebuildCreditSchedule(supabase, credit);

    await supabase.from("activity").insert({
      user_id: user.id,
      credit_id: credit.id,
      payment_id: payment.id,
      type: "payment",
      title: `Pago de cuota ${installment}`,
      description: credit.name,
      amount: money(value.amountPaid + value.extraPrincipal),
      occurred_at: new Date(`${value.paymentDate}T12:00:00Z`).toISOString(),
      metadata: { installment, balance_after: result.balance },
    });

    if (result.settled) {
      await supabase.from("activity").insert({
        user_id: user.id,
        credit_id: credit.id,
        payment_id: null,
        type: "credit_paid",
        title: "Crédito pagado",
        description: `${credit.name} llegó a cero`,
        amount: null,
      });
    }

    revalidateCredit(credit.id);

    return {
      ok: true,
      data: {
        newBalance: result.balance,
        creditSettled: result.settled,
        installmentsLeft: result.installmentsLeft,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Abono a capital
// ---------------------------------------------------------------------------

const extraSchema = z.object({
  creditId: z.string().uuid(),
  paymentDate: z.string().regex(ISO_DATE, "Elige la fecha del abono."),
  amount: z.number().positive("El abono debe ser mayor que cero."),
  notes: z.string().trim().max(300).optional().nullable(),
});

export type ExtraPrincipalInput = z.input<typeof extraSchema>;

export interface ExtraPrincipalResultData {
  newBalance: number;
  creditSettled: boolean;
  installmentsLeft: number;
  installmentsSaved: number;
}

/** Registra un abono extraordinario a capital y recalcula el plan. */
export async function registerExtraPrincipal(
  input: ExtraPrincipalInput,
): Promise<ActionResult<ExtraPrincipalResultData>> {
  const parsed = extraSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  try {
    const credit = await loadCredit(supabase, value.creditId);
    if (!credit) return { ok: false, error: "No encontramos ese crédito." };
    if (credit.status === "cancelled") {
      return { ok: false, error: "Este crédito está cancelado." };
    }

    const before = await currentBalance(supabase, credit);
    if (before.installment == null) {
      return { ok: false, error: "Este crédito ya está pagado." };
    }
    if (value.amount > before.balance + 0.009) {
      return {
        ok: false,
        error: `El abono supera el saldo pendiente (${formatMoney(
          before.balance,
          credit.currency,
        )}).`,
      };
    }
    if (
      await isDuplicate(supabase, credit.id, value.paymentDate, 0, value.amount)
    ) {
      return { ok: false, error: "Ese abono ya se acaba de registrar." };
    }

    const { count } = await supabase
      .from("credit_schedule")
      .select("id", { count: "exact", head: true })
      .eq("credit_id", credit.id)
      .neq("status", "paid");
    const pendingBefore = count ?? 0;

    const { data: payment, error } = await supabase
      .from("payments")
      .insert({
        credit_id: credit.id,
        user_id: user.id,
        installment_number: null,
        payment_date: value.paymentDate,
        amount_paid: 0,
        principal_paid: 0,
        interest_paid: 0,
        extra_principal: money(value.amount),
        balance_after: null,
        notes: value.notes?.trim() || null,
      })
      .select("id")
      .single();

    if (error) return { ok: false, error: error.message };

    const result = await rebuildCreditSchedule(supabase, credit);
    const installmentsSaved = Math.max(
      0,
      pendingBefore - result.installmentsLeft,
    );

    await supabase.from("activity").insert({
      user_id: user.id,
      credit_id: credit.id,
      payment_id: payment.id,
      type: "extra_principal",
      title: "Abono a capital",
      description: credit.name,
      amount: money(value.amount),
      occurred_at: new Date(`${value.paymentDate}T12:00:00Z`).toISOString(),
      metadata: {
        balance_after: result.balance,
        installments_saved: installmentsSaved,
        mode: credit.extra_principal_mode,
      },
    });

    revalidateCredit(credit.id);

    return {
      ok: true,
      data: {
        newBalance: result.balance,
        creditSettled: result.settled,
        installmentsLeft: result.installmentsLeft,
        installmentsSaved,
      },
    };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

// ---------------------------------------------------------------------------
// Corregir un movimiento
// ---------------------------------------------------------------------------

const editSchema = z.object({
  paymentId: z.string().uuid(),
  paymentDate: z.string().regex(ISO_DATE, "Elige la fecha."),
  amountPaid: z.number().min(0),
  extraPrincipal: z.number().min(0),
  notes: z.string().trim().max(300).optional().nullable(),
});

export type EditPaymentInput = z.input<typeof editSchema>;

/**
 * Corrige un movimiento ya registrado.
 *
 * Cambiar un pago de hace seis meses altera todo lo que vino después, así que
 * no se parchea nada: se reconstruye el plan entero desde el historial nuevo.
 */
export async function updatePayment(
  input: EditPaymentInput,
): Promise<ActionResult<RebuildResult>> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0].message };
  }
  const value = parsed.data;

  if (value.amountPaid + value.extraPrincipal <= 0) {
    return { ok: false, error: "El movimiento debe tener algún importe." };
  }

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  try {
    const { data: existing, error: loadError } = await supabase
      .from("payments")
      .select("id, credit_id")
      .eq("id", value.paymentId)
      .maybeSingle();
    if (loadError) return { ok: false, error: loadError.message };
    if (!existing) return { ok: false, error: "No encontramos ese movimiento." };

    const credit = await loadCredit(supabase, existing.credit_id);
    if (!credit) return { ok: false, error: "No encontramos ese crédito." };

    const { error } = await supabase
      .from("payments")
      .update({
        payment_date: value.paymentDate,
        amount_paid: money(value.amountPaid),
        extra_principal: money(value.extraPrincipal),
        notes: value.notes?.trim() || null,
      })
      .eq("id", value.paymentId);
    if (error) return { ok: false, error: error.message };

    const result = await rebuildCreditSchedule(supabase, credit);

    await supabase.from("activity").insert({
      user_id: user.id,
      credit_id: credit.id,
      payment_id: value.paymentId,
      type: "credit_updated",
      title: "Movimiento corregido",
      description: credit.name,
      amount: money(value.amountPaid + value.extraPrincipal),
      metadata: { balance_after: result.balance },
    });

    revalidateCredit(credit.id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

/** Elimina un movimiento y vuelve a derivar el plan sin él. */
export async function deletePayment(
  paymentId: string,
): Promise<ActionResult<RebuildResult>> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const supabase = await createClient();

  try {
    const { data: existing, error: loadError } = await supabase
      .from("payments")
      .select("id, credit_id, amount_paid, extra_principal")
      .eq("id", paymentId)
      .maybeSingle();
    if (loadError) return { ok: false, error: loadError.message };
    if (!existing) return { ok: false, error: "No encontramos ese movimiento." };

    const credit = await loadCredit(supabase, existing.credit_id);
    if (!credit) return { ok: false, error: "No encontramos ese crédito." };

    // La actividad enlazada se queda sin pago (ON DELETE SET NULL); se borra
    // para que el historial no muestre un movimiento que ya no existe.
    await supabase.from("activity").delete().eq("payment_id", paymentId);

    const { error } = await supabase
      .from("payments")
      .delete()
      .eq("id", paymentId);
    if (error) return { ok: false, error: error.message };

    const result = await rebuildCreditSchedule(supabase, credit);

    await supabase.from("activity").insert({
      user_id: user.id,
      credit_id: credit.id,
      payment_id: null,
      type: "credit_updated",
      title: "Movimiento eliminado",
      description: credit.name,
      amount: money(
        Number(existing.amount_paid) + Number(existing.extra_principal),
      ),
      metadata: { balance_after: result.balance },
    });

    revalidateCredit(credit.id);
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : "No pudimos completar la operación.";
}
