import "server-only";

import { cache } from "react";
import { entitlementFromBillingContext } from "@/features/billing/queries";
import { createClient } from "@/infrastructure/supabase/server";
import { todayISO } from "@/shared/lib/dates";
import type { BillingEntitlement } from "@/core/billing";
import type {
  CreditSummaryRow,
  CurrentDashboardSnapshotRow,
  DashboardBudgetRow,
  RevolvingSummaryRow,
  UserRoleDB,
} from "@/shared/types/database";

/** El sueldo del mes, listo para pintar: importes ya numéricos. */
export interface DashboardIncome {
  name: string;
  amount: number;
  receivedDate: string;
}

export interface DashboardBudget {
  month: string;
  /** `projected` = arrastrado de un mes anterior, no confirmado todavía. */
  source: DashboardBudgetRow["source"];
  currency: string | null;
  incomes: DashboardIncome[];
  total: number;
}

export interface DashboardSnapshot {
  profile: {
    fullName: string | null;
    avatarUrl: string | null;
    role: UserRoleDB;
  } | null;
  credits: CreditSummaryRow[];
  cards: RevolvingSummaryRow[];
  entitlement: BillingEntitlement | null;
  budget: DashboardBudget;
}

export const getDashboardSnapshot = cache(async (): Promise<DashboardSnapshot> => {
  const supabase = await createClient();
  // El mes lo calcula el cliente: `todayISO` respeta NEXT_PUBLIC_APP_TZ, y el
  // servidor de Vercel corre en UTC —el día 1 a medianoche no coincidirían.
  const { data, error } = await supabase.rpc("current_dashboard_snapshot", {
    p_month: `${todayISO().slice(0, 7)}-01`,
  });
  if (error) throw new Error(error.message);

  const snapshot = data as CurrentDashboardSnapshotRow | null;
  if (!snapshot) throw new Error("No pudimos preparar el resumen de Inicio.");
  return {
    profile: snapshot.profile
      ? {
          fullName: snapshot.profile.full_name,
          avatarUrl: snapshot.profile.avatar_url,
          role: snapshot.profile.role,
        }
      : null,
    credits: snapshot.credits ?? [],
    cards: snapshot.cards ?? [],
    budget: toBudget(snapshot.budget),
    entitlement: snapshot.billing
      ? entitlementFromBillingContext(snapshot.billing)
      : null,
  };
});

/** `numeric` de Postgres llega como texto en JSON; aquí se vuelve número una vez. */
function toBudget(row: DashboardBudgetRow | null | undefined): DashboardBudget {
  const incomes = (row?.incomes ?? []).map((income) => ({
    name: income.name,
    amount: Number(income.amount),
    receivedDate: income.received_date,
  }));

  return {
    month: row?.month ?? "",
    source: row?.source ?? "empty",
    currency: row?.currency ?? null,
    incomes,
    total: incomes.reduce((sum, income) => sum + income.amount, 0),
  };
}
