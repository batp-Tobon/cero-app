import "server-only";

import { cache } from "react";
import { entitlementFromBillingContext } from "@/features/billing/queries";
import { createClient } from "@/infrastructure/supabase/server";
import type { BillingEntitlement } from "@/core/billing";
import type {
  CreditSummaryRow,
  CurrentDashboardSnapshotRow,
  RevolvingSummaryRow,
  UserRoleDB,
} from "@/shared/types/database";

export interface DashboardSnapshot {
  profile: {
    fullName: string | null;
    avatarUrl: string | null;
    role: UserRoleDB;
  } | null;
  credits: CreditSummaryRow[];
  cards: RevolvingSummaryRow[];
  entitlement: BillingEntitlement | null;
}

export const getDashboardSnapshot = cache(async (): Promise<DashboardSnapshot> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_dashboard_snapshot");
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
    entitlement: snapshot.billing
      ? entitlementFromBillingContext(snapshot.billing)
      : null,
  };
});
