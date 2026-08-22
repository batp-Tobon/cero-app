"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getProOffer } from "@/features/billing/catalog";
import { isWompiCheckoutConfigured } from "@/features/billing/config";
import { buildWompiCheckoutUrl, buildWompiReference } from "@/features/billing/wompi";
import { hasValidReceiptSignature } from "@/features/receipts/validation";
import { RECEIPT_MAX_BYTES } from "@/features/receipts/constants";
import { createAdminClient } from "@/infrastructure/supabase/admin";
import { createClient, getCurrentUser } from "@/infrastructure/supabase/server";
import { env } from "@/shared/lib/env";
import type { SaasBillingPaymentRow } from "@/shared/types/database";
import type { ActionResult } from "@/shared/types/domain";

const BILLING_PROOF_BUCKET = "saas-payment-proofs";
const manualPaymentSchema = z.object({
  reference: z.string().trim().max(200).optional(),
  proofPath: z.string().min(40).max(500),
  proofName: z.string().trim().min(1).max(200),
});

function checkoutError(message: string): string {
  if (message.includes("service role")) {
    return "Los pagos todavía no están configurados en el servidor.";
  }
  return "No pudimos iniciar el pago. Inténtalo nuevamente.";
}

export async function createWompiCheckout(): Promise<
  ActionResult<{ url: string }>
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };
  if (!isWompiCheckoutConfigured()) {
    return { ok: false, error: "Los pagos en línea aún no están habilitados." };
  }

  try {
    const supabase = await createClient();
    const { price } = await getProOffer(supabase);
    const amountInCents = Math.round(Number(price.amount) * 100);
    if (!Number.isSafeInteger(amountInCents) || amountInCents <= 0) {
      return { ok: false, error: "El precio del plan no es válido." };
    }

    const redirectUrl = new URL("/suscripcion?pago=procesando", env.appUrl);
    if (
      process.env.NEXT_PUBLIC_WOMPI_PUBLIC_KEY?.startsWith("pub_prod_") &&
      redirectUrl.protocol !== "https:"
    ) {
      return {
        ok: false,
        error: "La URL pública debe usar HTTPS para recibir pagos reales.",
      };
    }

    const admin = createAdminClient();
    const recentSince = new Date(Date.now() - 5 * 60_000).toISOString();
    const { data: recent } = await admin
      .from("saas_billing_payments")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "wompi")
      .eq("price_id", price.id)
      .eq("status", "pending")
      .gte("created_at", recentSince)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let reference = (recent as SaasBillingPaymentRow | null)?.idempotency_key;
    if (!reference || !/^cero_[a-f0-9]{32}$/.test(reference)) {
      reference = buildWompiReference();
      const { error } = await admin.from("saas_billing_payments").insert({
        user_id: user.id,
        price_id: price.id,
        status: "pending",
        provider: "wompi",
        idempotency_key: reference,
        amount: Number(price.amount),
        currency: price.currency,
        metadata: { checkout: "web", version: 1 },
      });
      if (error) throw new Error(error.message);
    }

    const url = buildWompiCheckoutUrl({
      reference,
      amountInCents,
      redirectUrl: redirectUrl.toString(),
      customerEmail: user.email ?? undefined,
    });
    return { ok: true, data: { url } };
  } catch (error) {
    return {
      ok: false,
      error: checkoutError(error instanceof Error ? error.message : ""),
    };
  }
}

export async function submitManualPayment(input: unknown): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Tu sesión expiró." };

  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }
  const pathPattern = new RegExp(
    `^${user.id}/[0-9a-f-]{36}\\.(jpg|png|webp|pdf)$`,
  );
  if (!pathPattern.test(parsed.data.proofPath)) {
    return { ok: false, error: "La ruta del comprobante no es válida." };
  }

  const supabase = await createClient();
  try {
    const { price } = await getProOffer(supabase);
    const admin = createAdminClient();
    const { data: pending, error: pendingError } = await admin
      .from("saas_billing_payments")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "bre-b")
      .eq("status", "pending")
      .maybeSingle();
    if (pendingError) throw new Error(pendingError.message);
    if (pending) {
      return {
        ok: false,
        error: "Ya tienes un comprobante pendiente de revisión.",
      };
    }

    const { data: proof, error: downloadError } = await supabase.storage
      .from(BILLING_PROOF_BUCKET)
      .download(parsed.data.proofPath);
    if (downloadError || !proof) throw new Error(downloadError?.message ?? "proof missing");
    if (proof.size <= 0 || proof.size > RECEIPT_MAX_BYTES) {
      throw new Error("invalid proof size");
    }
    const signature = new Uint8Array(await proof.slice(0, 12).arrayBuffer());
    if (!hasValidReceiptSignature(proof.type, signature)) {
      throw new Error("invalid proof signature");
    }

    const { error: insertError } = await admin
      .from("saas_billing_payments")
      .insert({
        user_id: user.id,
        price_id: price.id,
        status: "pending",
        provider: "bre-b",
        idempotency_key: `breb_${crypto.randomUUID().replaceAll("-", "")}`,
        amount: Number(price.amount),
        currency: price.currency,
        submitted_reference: parsed.data.reference || null,
        proof_path: parsed.data.proofPath,
        proof_name: parsed.data.proofName,
        proof_mime: proof.type,
        proof_size: proof.size,
        metadata: { submitted_from: "subscription_page", version: 1 },
      });
    if (insertError) throw new Error(insertError.message);

    revalidatePath("/suscripcion");
    revalidatePath("/admin");
    return { ok: true, data: undefined };
  } catch (error) {
    await supabase.storage
      .from(BILLING_PROOF_BUCKET)
      .remove([parsed.data.proofPath]);
    const message = error instanceof Error ? error.message : "";
    return {
      ok: false,
      error: message.includes("duplicate")
        ? "Ya tienes un comprobante pendiente de revisión."
        : "No pudimos enviar el comprobante. Inténtalo nuevamente.",
    };
  }
}
