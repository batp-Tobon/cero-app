import "server-only";

import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import { todayISO } from "@/shared/lib/dates";
import type { SavingsSnapshotRow } from "@/shared/types/database";
import type { SavingsSnapshot } from "./types";

/** Sincroniza excedentes guardados y devuelve un resumen agregado del mes. */
export async function getSavingsSnapshot(month: string): Promise<SavingsSnapshot> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Tu sesión expiró.");

  const supabase = await createClient();
  const currentMonth = `${todayISO().slice(0, 7)}-01`;
  const sync = await supabase.rpc("sync_budget_surpluses", {
    p_through_month: currentMonth,
  });
  if (sync.error) throw new Error(sync.error.message);

  const { data, error } = await supabase.rpc("savings_snapshot", {
    p_month: month,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "No pudimos preparar tus ahorros.");
  }

  const row = data as SavingsSnapshotRow;
  return {
    month: row.month,
    currency: row.currency,
    budgetSaved: row.budget_saved,
    totalBalance: Number(row.total_balance),
    balanceAtMonthEnd: Number(row.balance_at_month_end),
    monthNet: Number(row.month_net),
    automaticSurplus: Number(row.automatic_surplus),
    pockets: (row.pockets ?? []).map((pocket) => ({
      id: pocket.id,
      name: pocket.name,
      currency: pocket.currency,
      goalAmount:
        pocket.goal_amount == null ? null : Number(pocket.goal_amount),
      color: pocket.color,
      icon: pocket.icon,
      isDefault: pocket.is_default,
      balance: Number(pocket.balance),
      balanceAtMonthEnd: Number(pocket.balance_at_month_end),
      monthNet: Number(pocket.month_net),
    })),
    movements: (row.movements ?? []).map((movement) => ({
      id: movement.id,
      pocketId: movement.pocket_id,
      pocketName: movement.pocket_name,
      kind: movement.kind,
      amount: Number(movement.amount),
      movementDate: movement.movement_date,
      sourceMonth: movement.source_month,
      description: movement.description,
    })),
  };
}
