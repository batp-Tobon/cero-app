import "server-only";

import { cache } from "react";
import {
  resolveBillingEntitlement,
  type BillingEntitlement,
  type EntitlementPlan,
} from "@/core/billing";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import type { CurrentBillingContextRow } from "@/shared/types/database";

export function entitlementFromBillingContext(
  context: CurrentBillingContextRow,
): BillingEntitlement {
  const freePlan: EntitlementPlan = {
    code: context.free_plan_code,
    features: context.free_plan_features,
  };
  const subscribedPlan = context.subscription_plan_code
    ? {
        code: context.subscription_plan_code,
        features: context.subscription_plan_features ?? {},
      }
    : null;

  return resolveBillingEntitlement({
    isAdmin: context.is_admin,
    freePlan,
    subscription: context.subscription_status && subscribedPlan
      ? {
          status: context.subscription_status,
          plan: subscribedPlan,
          trialEndsAt: context.trial_ends_at,
          currentPeriodEnd: context.current_period_end,
          graceEndsAt: context.grace_ends_at,
        }
      : null,
  });
}

/**
 * Único punto de lectura del acceso comercial del cliente. Las pantallas no
 * deben decidir por su cuenta si una prueba o suscripción sigue vigente.
 */
export const getCurrentBillingEntitlement = cache(async (): Promise<BillingEntitlement | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("current_billing_context");
  if (error) throw new Error(error.message);
  const context = data?.[0] as CurrentBillingContextRow | undefined;
  if (!context) throw new Error("No encontramos la configuración comercial.");
  return entitlementFromBillingContext(context);
});
