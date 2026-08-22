/**
 * Reconcilia los movimientos aportados por el titular y enlaza sus soportes.
 *
 * Uso:
 *   node scripts/reconcile-financial-records.mjs <correo> <cuota.png> <abono.png>
 *
 * El script busca por correo y nombres de producto, nunca por UUIDs generados.
 * Es idempotente y sólo debe ejecutarse después de la migración de comprobantes.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Las variables pueden venir del entorno.
  }
}

const [email, quotaReceipt, capitalReceipt] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey || !email || !quotaReceipt || !capitalReceipt) {
  console.error(
    "Uso: node scripts/reconcile-financial-records.mjs <correo> <cuota.png> <abono.png>",
  );
  process.exit(1);
}

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
});

try {
  const { replaySchedule } = await vite.ssrLoadModule("/src/core/amortization.ts");
  const { money } = await vite.ssrLoadModule("/src/core/money.ts");

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("id,email")
    .ilike("email", email)
    .maybeSingle();
  if (profileError || !profile) throw new Error(profileError?.message ?? "Usuario no encontrado");

  const [{ data: lot, error: lotError }, { data: card, error: cardError }] =
    await Promise.all([
      db
        .from("credits")
        .select("*")
        .eq("owner_id", profile.id)
        .ilike("name", "Lote")
        .maybeSingle(),
      db
        .from("revolving_accounts")
        .select("id")
        .eq("owner_id", profile.id)
        .ilike("name", "Tarjeta AV Villas")
        .maybeSingle(),
    ]);
  if (lotError || !lot) throw new Error(lotError?.message ?? "Crédito Lote no encontrado");
  if (cardError || !card) throw new Error(cardError?.message ?? "Tarjeta no encontrada");

  const { data: updatedLot, error: lotUpdateError } = await db
    .from("credits")
    .update({
      term_months: 48,
      extra_principal_mode: "reduce_installment",
      notes:
        "Crédito 35039446 · AV Villas · cuota fija con plazo variable (IBR). Extracto: 20,28% E.A.; próximo pago informado por el banco $3.158.229 el 02/09/2026.",
    })
    .eq("id", lot.id)
    .select("*")
    .single();
  if (lotUpdateError) throw new Error(lotUpdateError.message);

  const { data: originalPayments, error: paymentLoadError } = await db
    .from("payments")
    .select("*")
    .eq("credit_id", lot.id);
  if (paymentLoadError) throw new Error(paymentLoadError.message);

  const capital = originalPayments.find(
    (payment) =>
      payment.payment_date === "2026-07-11" &&
      Number(payment.extra_principal) > 0,
  );
  const quota = originalPayments.find(
    (payment) => Number(payment.amount_paid) === 5_200_000,
  );
  if (!capital || !quota) throw new Error("No encontramos los dos movimientos del Lote");

  const { error: capitalError } = await db
    .from("payments")
    .update({
      amount_paid: 0,
      extra_principal: 15_747_921,
      other_paid: 179_079,
      notes: "Pago total $15.927.000: $15.747.921 a capital y $179.079 de intereses.",
    })
    .eq("id", capital.id);
  if (capitalError) throw new Error(capitalError.message);

  const { error: quotaError } = await db
    .from("payments")
    .update({
      payment_date: "2026-07-26",
      amount_paid: 4_583_170,
      extra_principal: 616_830,
      other_paid: 0,
      notes: "Pago total $5.200.000: cuota $4.583.170 y abono adicional $616.830.",
    })
    .eq("id", quota.id);
  if (quotaError) throw new Error(quotaError.message);

  const { data: charge, error: chargeError } = await db
    .from("revolving_movements")
    .update({
      installment_count: 3,
      installments_paid: 0,
      description: "Consumo diferido a 3 cuotas · ninguna pagada",
    })
    .eq("account_id", card.id)
    .eq("kind", "charge")
    .eq("amount", 2_750_168)
    .select("id")
    .maybeSingle();
  if (chargeError || !charge) throw new Error(chargeError?.message ?? "Consumo de tarjeta no encontrado");

  const { data: payments, error: updatedPaymentsError } = await db
    .from("payments")
    .select("*")
    .eq("credit_id", lot.id)
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (updatedPaymentsError) throw new Error(updatedPaymentsError.message);

  const replay = replaySchedule({
    principal: Number(updatedLot.principal_amount),
    monthlyRate: Number(updatedLot.interest_rate_monthly),
    termMonths: updatedLot.term_months,
    system: updatedLot.amortization_system,
    firstPaymentDate: updatedLot.first_payment_date,
    mode: updatedLot.extra_principal_mode,
    events: payments.map((payment) => ({
      id: payment.id,
      date: payment.payment_date,
      settlesInstallment: Number(payment.amount_paid) > 0,
      amountPaid: Number(payment.amount_paid),
      extraPrincipal: Number(payment.extra_principal),
    })),
  });
  if (replay.rejected.length > 0) {
    throw new Error(`El motor rechazó movimientos: ${JSON.stringify(replay.rejected)}`);
  }

  const { error: clearScheduleError } = await db
    .from("credit_schedule")
    .delete()
    .eq("credit_id", lot.id);
  if (clearScheduleError) throw new Error(clearScheduleError.message);

  const allocationByInstallment = new Map(
    replay.allocations
      .filter((allocation) => allocation.installment != null)
      .map((allocation) => [allocation.installment, allocation]),
  );
  const registeredAt = new Map(payments.map((payment) => [payment.id, payment.created_at]));

  const { error: scheduleInsertError } = await db.from("credit_schedule").insert(
    replay.rows.map((row) => {
      const allocation = allocationByInstallment.get(row.installment);
      return {
        credit_id: lot.id,
        installment_number: row.installment,
        due_date: row.dueDate,
        opening_balance: money(row.openingBalance),
        payment_amount: money(row.payment),
        interest_amount: money(row.interest),
        principal_amount: money(row.principal),
        closing_balance: money(row.closingBalance),
        extra_principal_before: money(row.extraPrincipalBefore),
        paid_amount: money(row.paidAmount),
        status: row.paid ? "paid" : "pending",
        paid_at:
          row.paid && allocation?.id
            ? (registeredAt.get(allocation.id) ?? null)
            : null,
      };
    }),
  );
  if (scheduleInsertError) throw new Error(scheduleInsertError.message);

  await db.from("payments").update({ installment_number: null }).eq("credit_id", lot.id);
  for (const allocation of replay.allocations) {
    if (!allocation.id) continue;
    const { error } = await db
      .from("payments")
      .update({
        installment_number: allocation.installment,
        principal_paid: money(allocation.principalPaid),
        interest_paid: money(allocation.interestPaid),
        extra_principal: money(allocation.extraPrincipal),
        balance_after: money(allocation.balanceAfter),
      })
      .eq("id", allocation.id);
    if (error) throw new Error(error.message);
  }

  const uploads = [
    { payment: quota, file: quotaReceipt, label: "cuota" },
    { payment: capital, file: capitalReceipt, label: "abono-capital" },
  ];
  for (const item of uploads) {
    const bytes = readFileSync(item.file);
    const path = `${profile.id}/credits/${lot.id}/${item.payment.id}-${item.label}.png`;
    const { error: uploadError } = await db.storage
      .from("payment-receipts")
      .upload(path, bytes, { contentType: "image/png", upsert: true });
    if (uploadError) throw new Error(uploadError.message);

    const { error: linkError } = await db
      .from("payments")
      .update({
        receipt_path: path,
        receipt_name: `${item.label}.png`,
        receipt_mime: "image/png",
        receipt_size: bytes.byteLength,
      })
      .eq("id", item.payment.id);
    if (linkError) throw new Error(linkError.message);
  }

  await db
    .from("activity")
    .delete()
    .contains("metadata", { revolving_account: card.id })
    .eq("type", "payment");
  await db.from("activity").delete().in("payment_id", [capital.id, quota.id]);

  const finalAllocations = new Map(replay.allocations.map((item) => [item.id, item]));
  const { error: activityError } = await db.from("activity").insert([
    {
      user_id: profile.id,
      credit_id: lot.id,
      payment_id: capital.id,
      revolving_movement_id: null,
      type: "extra_principal",
      title: "Abono a capital",
      description: "Lote",
      amount: 15_927_000,
      occurred_at: "2026-07-11T12:00:00Z",
      metadata: {
        principal: 15_747_921,
        interest: 179_079,
        balance_after: finalAllocations.get(capital.id)?.balanceAfter,
        has_receipt: true,
      },
    },
    {
      user_id: profile.id,
      credit_id: lot.id,
      payment_id: quota.id,
      revolving_movement_id: null,
      type: "payment",
      title: "Pago de cuota 1",
      description: "Lote",
      amount: 5_200_000,
      occurred_at: "2026-07-26T12:00:00Z",
      metadata: {
        installment: 1,
        scheduled_payment: 4_583_170,
        extra_principal: 616_830,
        balance_after: finalAllocations.get(quota.id)?.balanceAfter,
        has_receipt: true,
      },
    },
  ]);
  if (activityError) throw new Error(activityError.message);

  console.log(
    JSON.stringify(
      {
        credit: updatedLot.name,
        termMonths: updatedLot.term_months,
        balance: money(replay.balance),
        payments: 2,
        cardInstallments: 3,
        cardInstallmentsPaid: 0,
        receipts: 2,
      },
      null,
      2,
    ),
  );
} finally {
  await vite.close();
}
