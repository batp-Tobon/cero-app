"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import {
  allocatePayment,
  recalculateRemaining,
  type AmortizationSystem,
  type ExtraPrincipalMode,
} from "@/core/domain/amortization";
import {
  closeCreditIfSettled,
  getPendingInstallments,
  money,
  replacePendingTail,
} from "@/server/services/schedule";
import { addMonths } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { ActionResult } from "@/types/domain";
import type { CreditRow, ScheduleRowDB } from "@/types/database";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Refresca todo lo que depende del saldo de un crédito. */
function revalidateCredit(creditId: string) {
  revalidatePath("/inicio");
  revalidatePath("/creditos");
  revalidatePath(`/creditos/${creditId}`);
  revalidatePath("/actividad");
}

/**
 * Recalcula y persiste la cola del plan tras mover el saldo.
 * Devuelve el saldo con el que queda el crédito.
 */
async function rewriteTail(
  supabase: Awaited<ReturnType<typeof createClient>>,
  credit: Pick<
    CreditRow,
    "id" | "interest_rate_monthly" | "amortization_system" | "extra_principal_mode"
  >,
  anchor: ScheduleRowDB,
  tail: ScheduleRowDB[],
  newBalance: number,
): Promise<void> {
  if (newBalance <= 0.009) {
    await closeCreditIfSettled(supabase, credit.id, 0);
    return;
  }

  // Si el saldo sobrevive a la última cuota programada (pago parcial en la
  // cuota final), hay que abrir una cuota más: la deuda no puede quedar sin
  // fecha de pago.
  const dueDates =
    tail.length > 0
      ? tail.map((r) => r.due_date)
      : [addMonths(anchor.due_date, 1)];

  const rows = recalculateRemaining({
    balance: newBalance,
    monthlyRate: Number(credit.interest_rate_monthly),
    system: credit.amortization_system as AmortizationSystem,
    mode: credit.extra_principal_mode as ExtraPrincipalMode,
    remainingDueDates: dueDates,
    startInstallment: anchor.installment_number + 1,
    currentPayment: Number(anchor.payment_amount),
    currentPrincipal: Number(anchor.principal_amount),
  });

  await replacePendingTail(
    supabase,
    credit.id,
    anchor.installment_number + 1,
    rows,
  );
}

// ---------------------------------------------------------------------------
// Pago de cuota
// ---------------------------------------------------------------------------

const paymentSchema = z.object({
  creditId: z.string().uuid(),
  installmentNumber: z.number().int().positive(),
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
 * Orden del proceso: validar la cuota, imputar interés y capital, escribir el
 * pago, cerrar la cuota, recalcular el saldo y dejar rastro en actividad.
 * Todo con el servidor como única fuente de verdad.
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

  const { data: credit, error: creditError } = await supabase
    .from("credits")
    .select("*")
    .eq("id", value.creditId)
    .maybeSingle();
  if (creditError) return { ok: false, error: creditError.message };
  if (!credit) return { ok: false, error: "No encontramos ese crédito." };
  if (credit.status !== "active") {
    return { ok: false, error: "Este crédito ya no está activo." };
  }

  const pending = await getPendingInstallments(supabase, value.creditId);
  if (pending.length === 0) {
    return { ok: false, error: "Este crédito ya está al día." };
  }

  // Las cuotas se pagan en orden: el saldo de cada una es el cierre de la
  // anterior, así que saltarse una rompería la cadena.
  const target = pending[0];
  if (target.installment_number !== value.installmentNumber) {
    return {
      ok: false,
      error: `Primero tienes que registrar la cuota ${target.installment_number}.`,
    };
  }

  const opening = Number(target.opening_balance);
  const allocation = allocatePayment({
    amount: value.amountPaid,
    scheduledInterest: Number(target.interest_amount),
    openingBalance: opening,
  });

  // El sobrante de la cuota se comporta igual que un abono a capital.
  const requestedExtra = value.extraPrincipal + allocation.surplus;
  const principalRoom = money(opening - allocation.principalPaid);

  if (requestedExtra > principalRoom + 0.009) {
    return {
      ok: false,
      error: `El pago supera la deuda: como máximo puedes abonar ${formatMoney(
        principalRoom,
        credit.currency,
      )} a capital.`,
    };
  }

  const extraApplied = money(Math.min(requestedExtra, principalRoom));
  const settledAmount = money(value.amountPaid - allocation.surplus);
  const newBalance = money(opening - allocation.principalPaid - extraApplied);

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      credit_id: credit.id,
      user_id: user.id,
      installment_number: target.installment_number,
      payment_date: value.paymentDate,
      amount_paid: settledAmount,
      principal_paid: money(allocation.principalPaid),
      interest_paid: money(allocation.interestPaid),
      extra_principal: extraApplied,
      balance_after: newBalance,
      notes: value.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (paymentError) {
    // El índice único de (credit_id, installment_number) frena el doble envío.
    const duplicated = paymentError.code === "23505";
    return {
      ok: false,
      error: duplicated
        ? "Esa cuota ya tiene un pago registrado."
        : paymentError.message,
    };
  }

  const { error: scheduleError } = await supabase
    .from("credit_schedule")
    .update({
      status: "paid",
      paid_amount: settledAmount,
      paid_at: new Date().toISOString(),
    })
    .eq("id", target.id);
  if (scheduleError) return { ok: false, error: scheduleError.message };

  // Sólo se reescribe el plan si el saldo se aparta del previsto: un pago
  // exacto y sin abono deja el cronograma intacto.
  const followsPlan =
    extraApplied === 0 &&
    Math.abs(newBalance - Number(target.closing_balance)) < 0.01;

  if (!followsPlan) {
    await rewriteTail(supabase, credit, target, pending.slice(1), newBalance);
  } else if (newBalance <= 0.009) {
    await closeCreditIfSettled(supabase, credit.id, 0);
  }

  const settled = newBalance <= 0.009;

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: credit.id,
    payment_id: payment.id,
    type: "payment",
    title: `Pago de cuota ${target.installment_number}`,
    description: credit.name,
    amount: money(settledAmount + extraApplied),
    occurred_at: new Date(`${value.paymentDate}T12:00:00Z`).toISOString(),
    metadata: {
      installment: target.installment_number,
      interest_paid: allocation.interestPaid,
      principal_paid: allocation.principalPaid,
      extra_principal: extraApplied,
      balance_after: newBalance,
    },
  });

  if (settled) {
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

  const { count } = await supabase
    .from("credit_schedule")
    .select("id", { count: "exact", head: true })
    .eq("credit_id", credit.id)
    .neq("status", "paid");

  revalidateCredit(credit.id);

  return {
    ok: true,
    data: {
      newBalance,
      creditSettled: settled,
      installmentsLeft: count ?? 0,
    },
  };
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

/**
 * Registra un abono extraordinario a capital y recalcula el plan según la
 * preferencia del crédito (reducir plazo o reducir cuota).
 */
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

  const { data: credit, error: creditError } = await supabase
    .from("credits")
    .select("*")
    .eq("id", value.creditId)
    .maybeSingle();
  if (creditError) return { ok: false, error: creditError.message };
  if (!credit) return { ok: false, error: "No encontramos ese crédito." };
  if (credit.status !== "active") {
    return { ok: false, error: "Este crédito ya no está activo." };
  }

  const pending = await getPendingInstallments(supabase, value.creditId);
  if (pending.length === 0) {
    return { ok: false, error: "Este crédito ya está pagado." };
  }

  const first = pending[0];
  const balance = Number(first.opening_balance);

  if (value.amount > balance + 0.009) {
    return {
      ok: false,
      error: `El abono supera el saldo pendiente (${formatMoney(
        balance,
        credit.currency,
      )}).`,
    };
  }

  const amount = money(Math.min(value.amount, balance));
  const newBalance = money(balance - amount);

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      credit_id: credit.id,
      user_id: user.id,
      installment_number: null,
      payment_date: value.paymentDate,
      amount_paid: 0,
      principal_paid: 0,
      interest_paid: 0,
      extra_principal: amount,
      balance_after: newBalance,
      notes: value.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (paymentError) return { ok: false, error: paymentError.message };

  if (newBalance <= 0.009) {
    await closeCreditIfSettled(supabase, credit.id, 0);
  } else {
    const rows = recalculateRemaining({
      balance: newBalance,
      monthlyRate: Number(credit.interest_rate_monthly),
      system: credit.amortization_system as AmortizationSystem,
      mode: credit.extra_principal_mode as ExtraPrincipalMode,
      remainingDueDates: pending.map((r) => r.due_date),
      startInstallment: first.installment_number,
      currentPayment: Number(first.payment_amount),
      currentPrincipal: Number(first.principal_amount),
    });
    await replacePendingTail(
      supabase,
      credit.id,
      first.installment_number,
      rows,
    );
  }

  const { count } = await supabase
    .from("credit_schedule")
    .select("id", { count: "exact", head: true })
    .eq("credit_id", credit.id)
    .neq("status", "paid");

  const installmentsLeft = count ?? 0;
  const installmentsSaved = Math.max(0, pending.length - installmentsLeft);

  await supabase.from("activity").insert({
    user_id: user.id,
    credit_id: credit.id,
    payment_id: payment.id,
    type: "extra_principal",
    title: "Abono a capital",
    description: credit.name,
    amount,
    occurred_at: new Date(`${value.paymentDate}T12:00:00Z`).toISOString(),
    metadata: {
      balance_after: newBalance,
      installments_saved: installmentsSaved,
      mode: credit.extra_principal_mode,
    },
  });

  revalidateCredit(credit.id);

  return {
    ok: true,
    data: {
      newBalance,
      creditSettled: newBalance <= 0.009,
      installmentsLeft,
      installmentsSaved,
    },
  };
}
