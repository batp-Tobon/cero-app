import { NextResponse } from "next/server";
import {
  expectedWompiEnvironment,
  isWompiWebhookConfigured,
} from "@/features/billing/config";
import {
  parseWompiTransaction,
  verifyWompiEvent,
  wompiEventIdentity,
  type WompiEventPayload,
} from "@/features/billing/wompi";
import { createAdminClient } from "@/infrastructure/supabase/admin";

export const runtime = "nodejs";

const MAX_EVENT_BYTES = 256 * 1024;
const FINAL_FAILURES = new Set(["DECLINED", "ERROR", "VOIDED"]);

function json(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status });
}

/**
 * Wompi es la autoridad del pago: la redirección del navegador nunca activa
 * planes. Este webhook valida firma, ambiente, referencia, monto e idempotencia.
 */
export async function POST(request: Request) {
  if (!isWompiWebhookConfigured()) {
    return json(503, { ok: false, error: "webhook_not_configured" });
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_EVENT_BYTES) {
    return json(413, { ok: false, error: "payload_too_large" });
  }

  const rawBody = await request.text();
  if (!rawBody || Buffer.byteLength(rawBody, "utf8") > MAX_EVENT_BYTES) {
    return json(400, { ok: false, error: "invalid_payload" });
  }

  let payload: WompiEventPayload;
  try {
    payload = JSON.parse(rawBody) as WompiEventPayload;
  } catch {
    return json(400, { ok: false, error: "invalid_json" });
  }

  if (!verifyWompiEvent(payload)) {
    return json(401, { ok: false, error: "invalid_signature" });
  }

  const expectedEnvironment = expectedWompiEnvironment();
  if (!expectedEnvironment || payload.environment !== expectedEnvironment) {
    return json(400, { ok: false, error: "environment_mismatch" });
  }

  const transaction = parseWompiTransaction(payload);
  const eventType = String(payload.event ?? "unknown").slice(0, 100);
  const { eventId, payloadSha256 } = wompiEventIdentity(rawBody);
  const admin = createAdminClient();

  const { error: eventInsertError } = await admin
    .from("saas_webhook_events")
    .upsert(
      {
        provider: "wompi",
        event_id: eventId,
        event_type: eventType,
        payload_sha256: payloadSha256,
        status: "received",
        attempts: 1,
      },
      { onConflict: "provider,event_id", ignoreDuplicates: true },
    );
  if (eventInsertError) {
    return json(500, { ok: false, error: "event_persistence_failed" });
  }

  const { data: storedEvent } = await admin
    .from("saas_webhook_events")
    .select("status")
    .eq("provider", "wompi")
    .eq("event_id", eventId)
    .single();
  if (storedEvent?.status === "processed" || storedEvent?.status === "ignored") {
    return json(200, { ok: true });
  }

  if (eventType !== "transaction.updated" || !transaction) {
    await admin
      .from("saas_webhook_events")
      .update({ status: "ignored", processed_at: new Date().toISOString() })
      .eq("provider", "wompi")
      .eq("event_id", eventId);
    return json(200, { ok: true });
  }

  try {
    if (transaction.status === "APPROVED") {
      const paidAt =
        typeof payload.sent_at === "string" &&
        Number.isFinite(Date.parse(payload.sent_at))
          ? new Date(payload.sent_at).toISOString()
          : new Date().toISOString();
      const { error } = await admin.rpc("process_wompi_saas_payment", {
        p_reference: transaction.reference,
        p_provider_payment_id: transaction.id,
        p_external_event_id: eventId,
        p_amount: transaction.amountInCents / 100,
        p_currency: transaction.currency,
        p_paid_at: paidAt,
      });
      if (error) throw new Error(error.message);
    } else if (FINAL_FAILURES.has(transaction.status)) {
      await admin
        .from("saas_billing_payments")
        .update({
          status: transaction.status === "VOIDED" ? "canceled" : "failed",
          provider_payment_id: transaction.id,
          failure_code: transaction.status.toLowerCase(),
          failure_message: "Wompi no aprobó la transacción.",
        })
        .eq("provider", "wompi")
        .eq("idempotency_key", transaction.reference)
        .eq("status", "pending");
    }

    await admin
      .from("saas_webhook_events")
      .update({
        status: transaction.status === "APPROVED" ? "processed" : "ignored",
        processed_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("provider", "wompi")
      .eq("event_id", eventId);
    return json(200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 1000) : "error";
    await admin
      .from("saas_webhook_events")
      .update({ status: "failed", last_error: message })
      .eq("provider", "wompi")
      .eq("event_id", eventId);
    // Wompi reintenta cuando no recibe 200.
    return json(500, { ok: false, error: "processing_failed" });
  }
}
