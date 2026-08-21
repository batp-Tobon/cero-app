import "server-only";

import { createClient } from "@/infrastructure/supabase/server";
import { addMonths, parseISO, todayISO } from "@/lib/dates";
import type {
  RevolvingAccountRow,
  RevolvingMovementRow,
  RevolvingSummaryRow,
} from "@/types/database";

export type RevolvingSummary = RevolvingSummaryRow;

/** Cuentas rotativas del usuario, la más reciente primero. */
export async function getRevolvingSummaries(): Promise<RevolvingSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revolving_summary")
    .select("*")
    .order("status", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface RevolvingDetail {
  account: RevolvingAccountRow;
  summary: RevolvingSummary;
  movements: RevolvingMovementRow[];
}

export async function getRevolvingDetail(
  accountId: string,
): Promise<RevolvingDetail | null> {
  const supabase = await createClient();

  const [accountRes, summaryRes, movementsRes] = await Promise.all([
    supabase
      .from("revolving_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle(),
    supabase
      .from("revolving_summary")
      .select("*")
      .eq("id", accountId)
      .maybeSingle(),
    supabase
      .from("revolving_movements")
      .select("*")
      .eq("account_id", accountId)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (accountRes.error) throw new Error(accountRes.error.message);
  if (summaryRes.error) throw new Error(summaryRes.error.message);
  if (movementsRes.error) throw new Error(movementsRes.error.message);
  if (!accountRes.data || !summaryRes.data) return null;

  return {
    account: accountRes.data,
    summary: summaryRes.data,
    movements: movementsRes.data ?? [],
  };
}

/**
 * Próxima fecha límite de pago.
 *
 * Si hay extracto emitido manda su fecha; si no, se proyecta a partir del día
 * de pago configurado. Nunca devuelve una fecha ya pasada.
 */
export function nextDueDate(
  account: Pick<RevolvingAccountRow, "due_day">,
  statementDueDate: string | null,
  today = todayISO(),
): string {
  if (statementDueDate && statementDueDate >= today) return statementDueDate;

  const { year, month } = parseISO(today);
  const day = String(account.due_day).padStart(2, "0");
  const candidate = `${year}-${String(month).padStart(2, "0")}-${day}`;
  return candidate >= today ? candidate : addMonths(candidate, 1);
}
