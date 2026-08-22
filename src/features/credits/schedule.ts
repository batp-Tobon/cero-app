import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, CreditRow, PaymentRow } from "@/shared/types/database";
import {
  replaySchedule,
  type AmortizationSystem,
  type ExtraPrincipalMode,
  type ReplayResult,
} from "@/core/amortization";
import { money } from "@/core/money";

type DB = SupabaseClient<Database>;

export interface RebuildResult {
  balance: number;
  settled: boolean;
  installmentsLeft: number;
  installmentsPaid: number;
  rejected: ReplayResult["rejected"];
}

/**
 * Vuelve a derivar el plan de pagos completo desde el crédito y su historial.
 *
 * Es la ÚNICA función que escribe en `credit_schedule`. Todo lo que mueve
 * dinero (registrar, editar o borrar un pago) termina llamando aquí, así que
 * el plan nunca puede quedar desincronizado de los movimientos.
 *
 * Reescribe el plan entero en vez de parchear filas: con 72 cuotas el coste es
 * irrelevante y a cambio desaparece toda una familia de estados corruptos.
 */
export async function rebuildCreditSchedule(
  db: DB,
  credit: CreditRow,
): Promise<RebuildResult> {
  const { data: payments, error: paymentsError } = await db
    .from("payments")
    .select("*")
    .eq("credit_id", credit.id)
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (paymentsError) throw new Error(paymentsError.message);

  const history = (payments ?? []) as PaymentRow[];

  const replay = replaySchedule({
    principal: Number(credit.principal_amount),
    monthlyRate: Number(credit.interest_rate_monthly),
    termMonths: credit.term_months,
    system: credit.amortization_system as AmortizationSystem,
    firstPaymentDate: credit.first_payment_date,
    mode: credit.extra_principal_mode as ExtraPrincipalMode,
    events: history.map((p) => ({
      id: p.id,
      date: p.payment_date,
      // Un movimiento sin cuota asociada es un abono a capital suelto.
      settlesInstallment: Number(p.amount_paid) > 0,
      amountPaid: Number(p.amount_paid),
      extraPrincipal: Number(p.extra_principal),
    })),
  });

  // Momento en que se registró cada pago, para conservar `paid_at`.
  const registeredAt = new Map(history.map((p) => [p.id, p.created_at]));

  // --- Plan de pagos -------------------------------------------------------
  const { error: deleteError } = await db
    .from("credit_schedule")
    .delete()
    .eq("credit_id", credit.id);
  if (deleteError) throw new Error(deleteError.message);

  const paidByInstallment = new Map(
    replay.allocations
      .filter((a) => a.installment != null)
      .map((a) => [a.installment as number, a]),
  );

  if (replay.rows.length > 0) {
    const { error: insertError } = await db.from("credit_schedule").insert(
      replay.rows.map((row) => {
        const allocation = paidByInstallment.get(row.installment);
        return {
          credit_id: credit.id,
          installment_number: row.installment,
          due_date: row.dueDate,
          opening_balance: money(row.openingBalance),
          payment_amount: money(row.payment),
          interest_amount: money(row.interest),
          principal_amount: money(row.principal),
          closing_balance: money(row.closingBalance),
          extra_principal_before: money(row.extraPrincipalBefore),
          paid_amount: money(row.paidAmount),
          status: row.paid ? ("paid" as const) : ("pending" as const),
          paid_at:
            row.paid && allocation?.id
              ? (registeredAt.get(allocation.id) ?? null)
              : null,
        };
      }),
    );
    if (insertError) throw new Error(insertError.message);
  }

  // --- Imputación de cada pago --------------------------------------------
  // Dos pasadas: al renumerar, un pago puede tomar el número que otro todavía
  // ocupa. Se vacían primero y se asignan después.
  if (history.length > 0) {
    const { error: clearError } = await db
      .from("payments")
      .update({ installment_number: null })
      .eq("credit_id", credit.id);
    if (clearError) throw new Error(clearError.message);
  }

  for (const allocation of replay.allocations) {
    if (!allocation.id) continue;
    const { error } = await db
      .from("payments")
      .update({
        installment_number: allocation.installment,
        principal_paid: money(allocation.principalPaid),
        interest_paid: money(allocation.interestPaid),
        extra_principal: money(allocation.extraPrincipal),
        balance_after: money(allocation.balanceAfter),
      })
      .eq("id", allocation.id);
    if (error) throw new Error(error.message);
  }

  // --- Estado del crédito --------------------------------------------------
  const nextStatus = replay.settled ? "paid" : "active";
  if (credit.status !== nextStatus && credit.status !== "cancelled") {
    const { error } = await db
      .from("credits")
      .update({ status: nextStatus })
      .eq("id", credit.id);
    if (error) throw new Error(error.message);
  }

  return {
    balance: money(replay.balance),
    settled: replay.settled,
    installmentsLeft: replay.rows.filter((r) => !r.paid).length,
    installmentsPaid: replay.rows.filter((r) => r.paid).length,
    rejected: replay.rejected,
  };
}

/** Carga un crédito comprobando que el usuario puede verlo (vía RLS). */
export async function loadCredit(
  db: DB,
  creditId: string,
): Promise<CreditRow | null> {
  const { data, error } = await db
    .from("credits")
    .select("*")
    .eq("id", creditId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}
