export type SaasSubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "expired";

export type PlanFeatureValue = boolean | number | string | null;

export interface EntitlementPlan {
  code: string;
  features: Record<string, PlanFeatureValue>;
}

export interface EntitlementSubscription {
  status: SaasSubscriptionStatus;
  plan: EntitlementPlan;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  graceEndsAt?: string | null;
}

export type EntitlementReason =
  | "administrator"
  | "free_plan"
  | "trial_active"
  | "trial_expired"
  | "subscription_active"
  | "subscription_indefinite"
  | "subscription_expired"
  | "payment_grace"
  | "payment_past_due"
  | "cancellation_scheduled"
  | "subscription_canceled"
  | "subscription_missing_period";

export interface BillingEntitlement {
  tier: string;
  reason: EntitlementReason;
  canRead: true;
  canExport: true;
  canWrite: boolean;
  accessUntil: string | null;
  features: Record<string, PlanFeatureValue>;
}

interface ResolveEntitlementInput {
  isAdmin: boolean;
  freePlan: EntitlementPlan;
  subscription?: EntitlementSubscription | null;
  now?: Date;
}

function isFuture(value: string | null | undefined, now: number): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > now;
}

/** PostgreSQL serializa sus marcas temporales infinitas como texto. */
export function isIndefiniteAccess(
  value: string | null | undefined,
): boolean {
  return value === "infinity" || value === "+infinity";
}

function entitlement(
  plan: EntitlementPlan,
  reason: EntitlementReason,
  canWrite: boolean,
  accessUntil: string | null = null,
): BillingEntitlement {
  return {
    tier: plan.code,
    reason,
    canRead: true,
    canExport: true,
    canWrite,
    accessUntil,
    features: { ...plan.features },
  };
}

/**
 * Resuelve el acceso comercial sin tocar red, React ni PostgreSQL.
 *
 * Una suscripción vencida nunca secuestra la información del cliente: leer y
 * exportar siguen disponibles; sólo las nuevas escrituras pueden limitarse.
 * Las Server Actions consultan esta regla antes de cualquier escritura; leer
 * y exportar permanecen disponibles incluso después de vencer el acceso.
 */
export function resolveBillingEntitlement({
  isAdmin,
  freePlan,
  subscription,
  now = new Date(),
}: ResolveEntitlementInput): BillingEntitlement {
  if (isAdmin) {
    return entitlement(
      subscription?.plan ?? freePlan,
      "administrator",
      true,
    );
  }

  if (!subscription) {
    return entitlement(freePlan, "trial_expired", false);
  }

  const plan = subscription.plan;
  const nowMs = now.getTime();

  if (subscription.status === "trialing") {
    return isFuture(subscription.trialEndsAt, nowMs)
      ? entitlement(plan, "trial_active", true, subscription.trialEndsAt ?? null)
      : entitlement(plan, "trial_expired", false);
  }

  if (subscription.status === "active") {
    if (isIndefiniteAccess(subscription.currentPeriodEnd)) {
      return entitlement(plan, "subscription_indefinite", true);
    }
    if (!subscription.currentPeriodEnd) {
      return entitlement(plan, "subscription_missing_period", false);
    }
    return isFuture(subscription.currentPeriodEnd, nowMs)
      ? entitlement(
          plan,
          "subscription_active",
          true,
          subscription.currentPeriodEnd,
        )
      : entitlement(plan, "subscription_expired", false);
  }

  if (subscription.status === "past_due") {
    return isFuture(subscription.graceEndsAt, nowMs)
      ? entitlement(plan, "payment_grace", true, subscription.graceEndsAt ?? null)
      : entitlement(plan, "payment_past_due", false);
  }

  if (subscription.status === "canceled") {
    return isFuture(subscription.currentPeriodEnd, nowMs)
      ? entitlement(
          plan,
          "cancellation_scheduled",
          true,
          subscription.currentPeriodEnd,
        )
      : entitlement(plan, "subscription_canceled", false);
  }

  return entitlement(plan, "subscription_expired", false);
}

export function planAllows(
  entitlementValue: BillingEntitlement,
  feature: string,
): boolean {
  const value = entitlementValue.features[feature];
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === -1 || value > 0;
  return value != null;
}
