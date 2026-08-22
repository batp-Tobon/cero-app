import "server-only";

import {
  createClient,
  getCurrentProfile,
} from "@/infrastructure/supabase/server";
import type {
  AdminAuditLogRow,
  AdminBillingMetricsRow,
  ProfileRow,
  SaasBillingPaymentRow,
  SaasPlanRow,
  SaasPriceRow,
  SaasSubscriptionRow,
  UserRoleDB,
} from "@/shared/types/database";

export interface AdminPlan {
  id: string;
  code: string;
  name: string;
  isPublic: boolean;
  description: string | null;
  features: SaasPlanRow["features"];
  trialDays: number;
  monthlyPrice: number;
  currency: string;
}

export interface AdminSubscription {
  id: string;
  planId: string;
  planCode: string;
  planName: string;
  status: SaasSubscriptionRow["status"];
  accessUntil: string | null;
}

export interface AdminCustomer {
  id: string;
  email: string | null;
  fullName: string | null;
  role: UserRoleDB;
  createdAt: string;
  subscription: AdminSubscription | null;
}

export interface AdminPayment {
  id: string;
  userId: string;
  customer: string;
  status: SaasBillingPaymentRow["status"];
  amount: number;
  currency: string;
  provider: string;
  createdAt: string;
  submittedReference: string | null;
  proofUrl: string | null;
}

export interface AdminAuditEvent {
  id: string;
  actor: string;
  action: string;
  targetType: string;
  reason: string;
  createdAt: string;
}

export interface AdminOverview {
  metrics: AdminBillingMetricsRow;
  customers: AdminCustomer[];
  customerCount: number;
  plans: AdminPlan[];
  payments: AdminPayment[];
  audit: AdminAuditEvent[];
}

type ProfileSummary = Pick<
  ProfileRow,
  "id" | "email" | "full_name" | "role" | "created_at"
>;

const EMPTY_METRICS: AdminBillingMetricsRow = {
  total_users: 0,
  total_admins: 0,
  active_subscriptions: 0,
  trial_subscriptions: 0,
  past_due_subscriptions: 0,
  revenue_30_days: 0,
  failed_payments_30_days: 0,
  audit_events_30_days: 0,
};

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

/**
 * Backoffice comercial. A propósito no consulta credits, payments, activity,
 * revolving_* ni budget_*: ser administrador de CERO no equivale a poder leer
 * las finanzas privadas de un cliente.
 */
export async function getAdminOverview(search = ""): Promise<AdminOverview> {
  const me = await getCurrentProfile();
  if (me?.role !== "admin") throw new Error("Administrator access required");

  const supabase = await createClient();
  const normalizedSearch = search.trim().slice(0, 100);

  let profilesQuery = supabase
    .from("profiles")
    .select("id,email,full_name,role,created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(50);

  if (normalizedSearch) {
    profilesQuery = profilesQuery.ilike(
      "email",
      `%${escapeLike(normalizedSearch)}%`,
    );
  }

  const [
    profilesRes,
    metricsRes,
    plansRes,
    pricesRes,
    paymentsRes,
    auditRes,
  ] =
    await Promise.all([
      profilesQuery,
      supabase.rpc("admin_billing_metrics"),
      supabase
        .from("saas_plans")
        .select("*")
        .order("sort_order", { ascending: true }),
      supabase
        .from("saas_prices")
        .select("*")
        .eq("billing_interval", "month")
        .eq("currency", "COP")
        .eq("is_active", true),
      supabase
        .from("saas_billing_payments")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8),
      supabase
        .from("admin_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  for (const result of [
    profilesRes,
    metricsRes,
    plansRes,
    pricesRes,
    paymentsRes,
    auditRes,
  ]) {
    if (result.error) throw new Error(result.error.message);
  }

  const profiles = (profilesRes.data ?? []) as ProfileSummary[];
  const userIds = profiles.map((profile) => profile.id);
  const subscriptionsRes = userIds.length
    ? await supabase
        .from("saas_subscriptions")
        .select("*")
        .in("user_id", userIds)
    : { data: [] as SaasSubscriptionRow[], error: null };

  if (subscriptionsRes.error) throw new Error(subscriptionsRes.error.message);

  const paymentRows = (paymentsRes.data ?? []) as SaasBillingPaymentRow[];
  const auditRows = (auditRes.data ?? []) as AdminAuditLogRow[];
  const visibleProfileIds = new Set(profiles.map((profile) => profile.id));
  const relatedProfileIds = [
    ...new Set([
      ...paymentRows.map((payment) => payment.user_id),
      ...auditRows.map((event) => event.actor_user_id),
    ]),
  ].filter((id) => !visibleProfileIds.has(id));
  const relatedProfilesRes = relatedProfileIds.length
    ? await supabase
        .from("profiles")
        .select("id,email,full_name,role,created_at")
        .in("id", relatedProfileIds)
    : { data: [] as ProfileSummary[], error: null };
  if (relatedProfilesRes.error) throw new Error(relatedProfilesRes.error.message);

  const plans = (plansRes.data ?? []) as SaasPlanRow[];
  const priceByPlan = new Map(
    ((pricesRes.data ?? []) as SaasPriceRow[]).map((price) => [
      price.plan_id,
      price,
    ]),
  );
  const planById = new Map(plans.map((plan) => [plan.id, plan]));
  const subscriptionByUser = new Map(
    ((subscriptionsRes.data ?? []) as SaasSubscriptionRow[]).map(
      (subscription) => [subscription.user_id, subscription],
    ),
  );
  const profileById = new Map(
    [...profiles, ...((relatedProfilesRes.data ?? []) as ProfileSummary[])].map(
      (profile) => [profile.id, profile],
    ),
  );
  const proofUrlByPayment = new Map<string, string>();
  await Promise.all(
    paymentRows.map(async (payment) => {
      if (!payment.proof_path) return;
      const { data } = await supabase.storage
        .from("saas-payment-proofs")
        .createSignedUrl(payment.proof_path, 10 * 60);
      if (data?.signedUrl) proofUrlByPayment.set(payment.id, data.signedUrl);
    }),
  );

  return {
    metrics:
      ((metricsRes.data?.[0] as AdminBillingMetricsRow | undefined) ??
        EMPTY_METRICS),
    customers: profiles.map((profile) => {
      const subscription = subscriptionByUser.get(profile.id);
      const plan = subscription ? planById.get(subscription.plan_id) : undefined;
      const accessUntil = subscription
        ? subscription.trial_ends_at ??
          subscription.grace_ends_at ??
          subscription.current_period_end
        : null;

      return {
        id: profile.id,
        email: profile.email,
        fullName: profile.full_name,
        role: profile.role,
        createdAt: profile.created_at,
        subscription: subscription
          ? {
              id: subscription.id,
              planId: subscription.plan_id,
              planCode: plan?.code ?? "unknown",
              planName: plan?.name ?? "Plan no disponible",
              status: subscription.status,
              accessUntil,
            }
          : null,
      };
    }),
    customerCount: profilesRes.count ?? profiles.length,
    plans: plans.map((plan) => ({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      isPublic: plan.is_public,
      description: plan.description,
      features: plan.features,
      trialDays: plan.trial_days,
      monthlyPrice: Number(priceByPlan.get(plan.id)?.amount ?? 0),
      currency: priceByPlan.get(plan.id)?.currency ?? "COP",
    })),
    payments: paymentRows.map(
      (payment) => {
        const customer = profileById.get(payment.user_id);
        return {
          id: payment.id,
          userId: payment.user_id,
          customer:
            customer?.full_name ?? customer?.email ?? "Cliente no disponible",
          status: payment.status,
          amount: Number(payment.amount),
          currency: payment.currency,
          provider: payment.provider,
          createdAt: payment.created_at,
          submittedReference: payment.submitted_reference,
          proofUrl: proofUrlByPayment.get(payment.id) ?? null,
        };
      },
    ),
    audit: auditRows.map((event) => {
      const actor = profileById.get(event.actor_user_id);
      return {
        id: event.id,
        actor: actor?.full_name ?? actor?.email ?? event.actor_user_id,
        action: event.action,
        targetType: event.target_type,
        reason: event.reason,
        createdAt: event.created_at,
      };
    }),
  };
}
