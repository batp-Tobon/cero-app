import "server-only";

import { cache } from "react";
import { createClient } from "@/infrastructure/supabase/server";
import type {
  RevolvingAccountRow,
  RevolvingMovementRow,
  RevolvingSummaryRow,
} from "@/shared/types/database";

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

interface RevolvingDetail {
  account: RevolvingAccountRow;
  summary: RevolvingSummary;
  movements: RevolvingMovementRow[];
}

/** Igual que el detalle de crédito: `generateMetadata` y el render lo piden
 *  por separado, y `cache()` evita repetir las tres consultas. */
export const getRevolvingDetail = cache(async (
  accountId: string,
): Promise<RevolvingDetail | null> => {
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
});

