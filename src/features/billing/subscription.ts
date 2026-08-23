import "server-only";

import { cache } from "react";
import { entitlementFromBillingContext } from "@/features/billing/queries";
import type { ProOffer } from "@/features/billing/catalog";
import { billingConfig, isWompiCheckoutConfigured } from "@/features/billing/config";
import { getPaymentCodes, type PaymentCodes } from "@/features/billing/payment-qr";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import type { BillingEntitlement } from "@/core/billing";
import type {
  CurrentSubscriptionSnapshotRow,
  SaasBillingPaymentRow,
} from "@/shared/types/database";

export interface SubscriptionPageData {
  userId: string;
  offer: ProOffer;
  entitlement: BillingEntitlement;
  pendingManualPayment: SaasBillingPaymentRow | null;
  latestPayment: SaasBillingPaymentRow | null;
  wompiEnabled: boolean;
  paymentKey: string;
  paymentLink: string;
  codes: PaymentCodes;
  supportWhatsapp: string;
}

export const getSubscriptionPageData = cache(
  async (): Promise<SubscriptionPageData | null> => {
    const user = await getCurrentUser();
    if (!user) return null;

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("current_subscription_snapshot");
    if (error) throw new Error(error.message);
    const snapshot = data as CurrentSubscriptionSnapshotRow | null;
    if (!snapshot?.offer || !snapshot.billing) {
      throw new Error("No encontramos la oferta de CERO Pro.");
    }
    const payments = (snapshot.payments ?? []) as SaasBillingPaymentRow[];
    const codes = await getPaymentCodes(supabase, {
      paymentLink: billingConfig.paymentLink,
      paymentKey: billingConfig.paymentKey,
    });
    return {
      userId: user.id,
      offer: snapshot.offer,
      entitlement: entitlementFromBillingContext(snapshot.billing),
      pendingManualPayment:
        payments.find(
          (payment) => payment.provider === "bre-b" && payment.status === "pending",
        ) ?? null,
      latestPayment: payments[0] ?? null,
      wompiEnabled: isWompiCheckoutConfigured(),
      paymentKey: billingConfig.paymentKey,
      paymentLink: billingConfig.paymentLink,
      codes,
      supportWhatsapp: billingConfig.supportWhatsapp,
    };
  },
);
