import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, ScheduleRowDB } from "@/types/database";
import type { ScheduleRow } from "@/core/domain/amortization";

type DB = SupabaseClient<Database>;

/** Redondeo a dos decimales: la BD guarda numeric(16,2). */
const money = (n: number): number => Math.round(n * 100) / 100;

function toInsert(creditId: string, row: ScheduleRow) {
  return {
    credit_id: creditId,
    installment_number: row.installment,
    due_date: row.dueDate,
    opening_balance: money(row.openingBalance),
    payment_amount: money(row.payment),
    interest_amount: money(row.interest),
    principal_amount: money(row.principal),
    closing_balance: money(row.closingBalance),
  };
}

/** Escribe un plan de pagos recién generado. */
export async function insertSchedule(
  db: DB,
  creditId: string,
  rows: ScheduleRow[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db
    .from("credit_schedule")
    .insert(rows.map((r) => toInsert(creditId, r)));
  if (error) throw new Error(error.message);
}

/**
 * Sustituye la cola pendiente del plan por otra recalculada.
 *
 * Se borra y se reinserta en vez de actualizar fila a fila porque un abono a
 * capital puede cambiar el NÚMERO de cuotas, no sólo sus importes: al reducir
 * plazo sobran filas que ya no existen en el plan nuevo.
 *
 * Sólo toca cuotas no pagadas: el histórico es inmutable.
 */
export async function replacePendingTail(
  db: DB,
  creditId: string,
  fromInstallment: number,
  rows: ScheduleRow[],
): Promise<void> {
  const { error: deleteError } = await db
    .from("credit_schedule")
    .delete()
    .eq("credit_id", creditId)
    .gte("installment_number", fromInstallment)
    .neq("status", "paid");
  if (deleteError) throw new Error(deleteError.message);

  await insertSchedule(db, creditId, rows);
}

/** Cuotas pendientes de un crédito, en orden. */
export async function getPendingInstallments(
  db: DB,
  creditId: string,
): Promise<ScheduleRowDB[]> {
  const { data, error } = await db
    .from("credit_schedule")
    .select("*")
    .eq("credit_id", creditId)
    .neq("status", "paid")
    .order("installment_number", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Deja el crédito como pagado cuando ya no queda saldo. */
export async function closeCreditIfSettled(
  db: DB,
  creditId: string,
  balance: number,
): Promise<boolean> {
  if (balance > 0.009) return false;

  // Sin saldo no puede quedar plan pendiente: se limpia antes de cerrar.
  const { error: deleteError } = await db
    .from("credit_schedule")
    .delete()
    .eq("credit_id", creditId)
    .neq("status", "paid");
  if (deleteError) throw new Error(deleteError.message);

  const { error } = await db
    .from("credits")
    .update({ status: "paid" })
    .eq("id", creditId);
  if (error) throw new Error(error.message);
  return true;
}

export { money };
