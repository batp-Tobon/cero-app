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
import { createAdminClient } from "@/infrastructure/supabase/admin";

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
  const admin = createAdminClient();

  // Lectura optimista + commit transaccional. Si otra pestaña modifica el
  // historial entre ambos pasos, PostgreSQL lo detecta y se recalcula.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: payments, error: paymentsError } = await db
      .from("payments")
      .select("*")
      .eq("credit_id", credit.id)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (paymentsError) throw new Error(paymentsError.message);

    const history = (payments ?? []) as PaymentRow[];
    const replay = replaySchedule({
      principal: Number(credit.principal_amount),
      monthlyRate: Number(credit.interest_rate_monthly),
      termMonths: credit.term_months,
      system: credit.amortization_system as AmortizationSystem,
      firstPaymentDate: credit.first_payment_date,
      mode: credit.extra_principal_mode as ExtraPrincipalMode,
      events: history.map((payment) => ({
        id: payment.id,
        date: payment.payment_date,
        settlesInstallment: Number(payment.amount_paid) > 0,
        amountPaid: Number(payment.amount_paid),
        extraPrincipal: Number(payment.extra_principal),
      })),
    });

    if (replay.rejected.length > 0) {
      throw new Error(
        "El cambio dejaría movimientos posteriores fuera del saldo disponible.",
      );
    }

    const registeredAt = new Map(history.map((payment) => [payment.id, payment.created_at]));
    const paidByInstallment = new Map(
      replay.allocations
        .filter((allocation) => allocation.installment != null)
        .map((allocation) => [allocation.installment as number, allocation]),
    );

    const { error } = await admin.rpc("replace_credit_replay", {
      p_credit_id: credit.id,
      p_expected_history: history.map((payment) => ({
        id: payment.id,
        payment_date: payment.payment_date,
        amount_paid: Number(payment.amount_paid),
        extra_principal: Number(payment.extra_principal),
      })),
      p_schedule: replay.rows.map((row) => {
        const allocation = paidByInstallment.get(row.installment);
        return {
          installment_number: row.installment,
          due_date: row.dueDate,
          opening_balance: money(row.openingBalance),
          payment_amount: money(row.payment),
          interest_amount: money(row.interest),
          principal_amount: money(row.principal),
          closing_balance: money(row.closingBalance),
          extra_principal_before: money(row.extraPrincipalBefore),
          paid_amount: money(row.paidAmount),
          status: row.paid ? "paid" : "pending",
          paid_at:
            row.paid && allocation?.id
              ? (registeredAt.get(allocation.id) ?? null)
              : null,
        };
      }),
      p_allocations: replay.allocations.map((allocation) => ({
        id: allocation.id,
        installment_number: allocation.installment,
        amount_paid: money(allocation.paidAmount),
        principal_paid: money(allocation.principalPaid),
        interest_paid: money(allocation.interestPaid),
        extra_principal: money(allocation.extraPrincipal),
        balance_after: money(allocation.balanceAfter),
      })),
      p_next_status: replay.settled ? "paid" : "active",
    });

    if (!error) {
      return {
        balance: money(replay.balance),
        settled: replay.settled,
        installmentsLeft: replay.rows.filter((row) => !row.paid).length,
        installmentsPaid: replay.rows.filter((row) => row.paid).length,
        rejected: [],
      };
    }
    if (!error.message.includes("history changed") || attempt === 2) {
      throw new Error(error.message);
    }
  }

  throw new Error("No pudimos estabilizar el historial del crédito.");
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
