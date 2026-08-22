/**
 * Verifica el modelo de permisos contra la base de datos REAL.
 *
 *   node scripts/verify-rls.mjs
 *
 * Las políticas RLS no se pueden probar razonando sobre el papel: hay que
 * autenticarse como un usuario de verdad y comprobar qué devuelve Postgres.
 * Este script crea dos usuarios temporales, monta un escenario de pareja
 * (un crédito compartido y uno privado cada uno) y comprueba los límites.
 *
 * Al terminar borra todo lo que creó, incluso si algo falla.
 *
 * Necesita SUPABASE_SERVICE_ROLE_KEY en .env.local.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* opcional */
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY o SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const STAMP = Date.now();
const PASSWORD = `Rls-Test-${STAMP}!`;
const people = [
  { label: "Ana", email: `cero-rls-a-${STAMP}@example.com` },
  { label: "Beto", email: `cero-rls-b-${STAMP}@example.com` },
];

let passed = 0;
let failed = 0;

function check(description, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  ✓ ${description}`);
  } else {
    failed++;
    console.log(`  ✗ ${description}${detail ? ` — ${detail}` : ""}`);
  }
}

async function signIn(email) {
  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (error) throw new Error(`login ${email}: ${error.message}`);
  return client;
}

const created = [];
const storagePaths = [];
const billingProofPaths = [];

try {
  // --- Usuarios ------------------------------------------------------------
  for (const person of people) {
    const { data, error } = await admin.auth.admin.createUser({
      email: person.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: person.label },
    });
    if (error) throw new Error(`crear ${person.email}: ${error.message}`);
    person.id = data.user.id;
    created.push(data.user.id);
  }

  const [ana, beto] = people;
  const asAna = await signIn(ana.email);
  const asBeto = await signIn(beto.email);

  // --- Escenario -----------------------------------------------------------
  const makeCredit = async (client, name) => {
    const { data, error } = await client
      .from("credits")
      .insert({
        owner_id: name.startsWith("Ana") ? ana.id : beto.id,
        name,
        type: "other",
        principal_amount: 1_000_000,
        interest_rate_monthly: 0.01,
        term_months: 12,
        amortization_system: "french",
        first_payment_date: "2026-01-01",
      })
      .select("id")
      .single();
    if (error) throw new Error(`crear crédito ${name}: ${error.message}`);
    return data.id;
  };

  const shared = await makeCredit(asAna, "Ana compartido");
  const anaPrivate = await makeCredit(asAna, "Ana privado");
  const betoPrivate = await makeCredit(asBeto, "Beto privado");

  const { data: card } = await asAna
    .from("revolving_accounts")
    .insert({
      owner_id: ana.id,
      name: "Tarjeta de Ana",
      credit_limit: 1_000_000,
    })
    .select("id")
    .single();

  console.log("\nCréditos propios y ajenos");
  {
    const { data } = await asBeto.from("credits").select("id,name");
    const names = (data ?? []).map((c) => c.name);
    check("Beto ve su propio crédito", names.includes("Beto privado"));
    check(
      "Beto NO ve los créditos de Ana",
      !names.includes("Ana privado") && !names.includes("Ana compartido"),
      `veía: ${names.join(", ")}`,
    );
  }

  console.log("\nCompartir");
  {
    const { error } = await asAna
      .from("credit_members")
      .insert({ credit_id: shared, user_id: beto.id, role: "member" });
    check("Ana puede compartir su crédito", !error, error?.message);

    const { data } = await asBeto.from("credits").select("id,name");
    const names = (data ?? []).map((c) => c.name);
    check("Beto ya ve el crédito compartido", names.includes("Ana compartido"));
    check(
      "Beto sigue sin ver el privado de Ana",
      !names.includes("Ana privado"),
    );

    const { data: members } = await asBeto
      .from("credit_members")
      .select("user_id, profiles(full_name)")
      .eq("credit_id", shared);
    check(
      "Beto ve a los dos miembros, con nombre",
      (members ?? []).length === 2 &&
        members.every((m) => m.profiles?.full_name),
      `devolvió ${members?.length ?? 0} filas`,
    );

    // El cronograma lo escribe la acción del servidor, no la base: aquí se
    // inserta a mano como Ana para poder comprobar que Beto lo lee.
    const { error: scheduleWriteError } = await asAna
      .from("credit_schedule")
      .insert({
        credit_id: shared,
        installment_number: 1,
        due_date: "2026-01-01",
        opening_balance: 1_000_000,
        payment_amount: 88_849,
        interest_amount: 10_000,
        principal_amount: 78_849,
        closing_balance: 921_151,
      });
    check("Ana puede escribir el plan de su crédito", !scheduleWriteError,
      scheduleWriteError?.message);

    const { data: schedule } = await asBeto
      .from("credit_schedule")
      .select("id")
      .eq("credit_id", shared);
    check("Beto ve el plan de pagos compartido", (schedule ?? []).length > 0);

    const { data: hiddenSchedule } = await asBeto
      .from("credit_schedule")
      .select("id")
      .eq("credit_id", anaPrivate);
    check(
      "Beto NO ve el plan del crédito privado de Ana",
      (hiddenSchedule ?? []).length === 0,
    );

    const { error: payError } = await asBeto.from("payments").insert({
      credit_id: shared,
      user_id: beto.id,
      payment_date: "2026-01-01",
      amount_paid: 50_000,
    });
    check("Beto puede registrar un pago en el compartido", !payError, payError?.message);

    const sharedReceiptPath = `${ana.id}/credits/${shared}/shared-rls.png`;
    const privateReceiptPath = `${ana.id}/credits/${anaPrivate}/private-rls.png`;
    const fakePng = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    for (const path of [sharedReceiptPath, privateReceiptPath]) {
      const { error: uploadError } = await asAna.storage
        .from("payment-receipts")
        .upload(path, fakePng, { contentType: "image/png" });
      check(`Ana sube comprobante privado ${path.includes("shared") ? "compartido" : "propio"}`,
        !uploadError, uploadError?.message);
      if (!uploadError) storagePaths.push(path);
    }

    const { error: sharedReceiptPaymentError } = await asAna.from("payments").insert({
      credit_id: shared,
      user_id: ana.id,
      payment_date: "2026-02-01",
      amount_paid: 25_000,
      receipt_path: sharedReceiptPath,
      receipt_name: "shared-rls.png",
      receipt_mime: "image/png",
      receipt_size: fakePng.byteLength,
    });
    const { error: privateReceiptPaymentError } = await asAna.from("payments").insert({
      credit_id: anaPrivate,
      user_id: ana.id,
      payment_date: "2026-02-01",
      amount_paid: 25_000,
      receipt_path: privateReceiptPath,
      receipt_name: "private-rls.png",
      receipt_mime: "image/png",
      receipt_size: fakePng.byteLength,
    });
    check(
      "Los comprobantes quedan enlazados a pagos válidos",
      !sharedReceiptPaymentError && !privateReceiptPaymentError,
      sharedReceiptPaymentError?.message ?? privateReceiptPaymentError?.message,
    );

    const { error: sharedDownloadError } = await asBeto.storage
      .from("payment-receipts")
      .download(sharedReceiptPath);
    const { error: privateDownloadError } = await asBeto.storage
      .from("payment-receipts")
      .download(privateReceiptPath);
    check("Beto ve el comprobante del crédito compartido", !sharedDownloadError,
      sharedDownloadError?.message);
    check("Beto NO ve el comprobante del crédito privado", Boolean(privateDownloadError));

    const { error: foreignUploadError } = await asBeto.storage
      .from("payment-receipts")
      .upload(`${ana.id}/credits/${shared}/spoof.png`, fakePng, {
        contentType: "image/png",
      });
    check("Beto NO puede subir archivos en la carpeta de Ana", Boolean(foreignUploadError));

    const { error: delError, count } = await asBeto
      .from("credits")
      .delete({ count: "exact" })
      .eq("id", shared);
    check(
      "Beto NO puede borrar el crédito de Ana",
      !delError && count === 0,
      `borró ${count} filas`,
    );
  }

  console.log("\nSuplantación");
  {
    const { error } = await asBeto.from("payments").insert({
      credit_id: anaPrivate,
      user_id: beto.id,
      payment_date: "2026-01-01",
      amount_paid: 1_000,
    });
    check("Beto NO puede pagar en un crédito que no ve", Boolean(error));

    const { error: spoof } = await asBeto.from("payments").insert({
      credit_id: shared,
      user_id: ana.id,
      payment_date: "2026-02-01",
      amount_paid: 1_000,
    });
    check("Beto NO puede registrar un pago a nombre de Ana", Boolean(spoof));
  }

  console.log("\nTarjetas (no se comparten)");
  {
    const { data } = await asBeto.from("revolving_accounts").select("id");
    check("Beto NO ve la tarjeta de Ana", (data ?? []).length === 0);
  }

  console.log("\nPresupuesto mensual");
  {
    const { data: budgetId, error: saveError } = await asAna.rpc(
      "save_monthly_budget_v2",
      {
        p_month: "2026-08-01",
        p_currency: "COP",
        p_incomes: [
          {
            name: "Sueldo",
            amount: 5_000_000,
            received_date: "2026-08-01",
            recurring: true,
            position: 0,
          },
        ],
        p_expenses: [
          {
            name: "Arriendo",
            category: "housing",
            amount: 1_500_000,
            due_day: 5,
            recurring: true,
            position: 0,
          },
          {
            name: "Mercado",
            category: "food",
            amount: 700_000,
            due_day: 10,
            recurring: true,
            position: 1,
          },
        ],
      },
    );
    check(
      "Ana puede guardar ingresos fechados y gastos en una transacción",
      !saveError,
      saveError?.message,
    );

    const { data: ownBudget } = await asAna
      .from("monthly_budgets")
      .select("income_amount, budget_incomes(name,received_date), budget_expenses(name)")
      .eq("id", budgetId)
      .single();
    check(
      "Ana lee su ingreso fechado y los dos gastos",
      Number(ownBudget?.income_amount) === 5_000_000 &&
        ownBudget?.budget_incomes?.length === 1 &&
        ownBudget.budget_incomes[0]?.received_date === "2026-08-01" &&
        ownBudget?.budget_expenses?.length === 2,
    );

    const { data: hiddenBudget } = await asBeto
      .from("monthly_budgets")
      .select("id")
      .eq("id", budgetId);
    check(
      "Beto NO ve el presupuesto de Ana",
      (hiddenBudget ?? []).length === 0,
    );

    const { error: foreignExpense } = await asBeto
      .from("budget_expenses")
      .insert({
        budget_id: budgetId,
        user_id: beto.id,
        name: "Gasto ajeno",
        amount: 1_000,
      });
    check(
      "Beto NO puede añadir gastos al presupuesto de Ana",
      Boolean(foreignExpense),
    );

    const { error: foreignIncome } = await asBeto
      .from("budget_incomes")
      .insert({
        budget_id: budgetId,
        user_id: beto.id,
        month: "2026-08-01",
        name: "Ingreso ajeno",
        amount: 1_000,
        received_date: "2026-08-01",
      });
    check(
      "Beto NO puede añadir ingresos al presupuesto de Ana",
      Boolean(foreignIncome),
    );

    const { error: anonSave } = await createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    }).rpc("save_monthly_budget_v2", {
      p_month: "2026-08-01",
      p_currency: "COP",
      p_incomes: [],
      p_expenses: [],
    });
    check("Un visitante sin sesión NO puede guardar presupuesto", Boolean(anonSave));
  }

  console.log("\nPerfiles y roles");
  {
    const { error: roleError, count: roleCount } = await asBeto
      .from("profiles")
      .update({ role: "admin" }, { count: "exact" })
      .eq("id", beto.id);
    check(
      "Beto NO puede ascenderse a admin",
      Boolean(roleError) || roleCount === 0,
      roleError ? "" : `actualizó ${roleCount} filas`,
    );

    const { error: emailError, count: emailCount } = await asBeto
      .from("profiles")
      .update({ email: "suplantado@example.com" }, { count: "exact" })
      .eq("id", beto.id);
    check(
      "Beto NO puede manipular el correo protegido del perfil",
      Boolean(emailError) || emailCount === 0,
    );

    const { data: protectedProfile } = await admin
      .from("profiles")
      .select("role,email")
      .eq("id", beto.id)
      .single();
    check(
      "El rol y correo protegidos siguen intactos",
      protectedProfile?.role === "user" && protectedProfile?.email === beto.email,
    );
  }

  console.log("\nBackoffice privado y SaaS");
  {
    const { error: bootstrapError } = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", ana.id);
    check("La conexión segura puede crear el admin inicial", !bootstrapError,
      bootstrapError?.message);

    const { data: visibleProfiles } = await asAna
      .from("profiles")
      .select("id");
    check(
      "Ana admin puede administrar las cuentas",
      (visibleProfiles ?? []).some((profile) => profile.id === beto.id),
    );

    const { data: hiddenCredit } = await asAna
      .from("credits")
      .select("id")
      .eq("id", betoPrivate);
    check(
      "Ana admin NO ve el crédito privado de Beto",
      (hiddenCredit ?? []).length === 0,
    );

    const { error: betoPaymentError } = await asBeto.from("payments").insert({
      credit_id: betoPrivate,
      user_id: beto.id,
      payment_date: "2026-03-01",
      amount_paid: 2_000,
    });
    check("Beto registra un movimiento privado", !betoPaymentError,
      betoPaymentError?.message);

    const { data: hiddenPayment } = await asAna
      .from("payments")
      .select("id")
      .eq("credit_id", betoPrivate);
    check(
      "Ana admin NO ve los pagos privados de Beto",
      (hiddenPayment ?? []).length === 0,
    );

    const { data: proPlan, error: planError } = await asAna
      .from("saas_plans")
      .select("id,name,description,trial_days,is_public,features")
      .eq("code", "pro")
      .single();
    check("El admin ve el catálogo comercial completo", !planError && Boolean(proPlan),
      planError?.message);

    const { data: visiblePro } = await asBeto
      .from("saas_plans")
      .select("id")
      .eq("code", "pro");
    check(
      "Un cliente ve el plan Pro publicado",
      visiblePro?.[0]?.id === proPlan?.id,
    );

    const { data: proPrice, error: priceError } = await asAna
      .from("saas_prices")
      .select("id,amount,currency")
      .eq("plan_id", proPlan?.id)
      .eq("is_active", true)
      .single();
    check(
      "El precio Pro se lee del catálogo y no del navegador",
      !priceError && Number(proPrice?.amount) === 10_000,
      priceError?.message,
    );

    const { data: automaticTrial } = await asBeto
      .from("saas_subscriptions")
      .select("status,trial_ends_at")
      .eq("user_id", beto.id)
      .single();
    check(
      "Cada cuenta nueva recibe automáticamente 5 días de prueba",
      automaticTrial?.status === "trialing" && Boolean(automaticTrial.trial_ends_at),
    );

    const { data: billingContext, error: billingContextError } = await asBeto.rpc(
      "current_billing_context",
    );
    check(
      "El acceso comercial se resuelve en una sola consulta",
      !billingContextError && billingContext?.[0]?.subscription_status === "trialing",
      billingContextError?.message,
    );

    const { data: dashboardSnapshot, error: dashboardSnapshotError } = await asBeto.rpc(
      "current_dashboard_snapshot",
    );
    check(
      "Inicio reúne perfil, productos y plan sin saltarse RLS",
      !dashboardSnapshotError &&
        dashboardSnapshot?.profile?.full_name === "Beto" &&
        dashboardSnapshot?.credits?.some((credit) => credit.name === "Beto privado") &&
        dashboardSnapshot?.credits?.some((credit) => credit.name === "Ana compartido") &&
        !dashboardSnapshot?.credits?.some((credit) => credit.name === "Ana privado") &&
        dashboardSnapshot?.billing?.subscription_status === "trialing",
      dashboardSnapshotError?.message,
    );

    const { data: subscriptionSnapshot, error: subscriptionSnapshotError } =
      await asBeto.rpc("current_subscription_snapshot");
    check(
      "Plan y pagos reúne sólo la oferta y cobros del cliente",
      !subscriptionSnapshotError &&
        subscriptionSnapshot?.offer?.plan?.code === "pro" &&
        subscriptionSnapshot?.billing?.subscription_status === "trialing" &&
        subscriptionSnapshot?.payments?.every((payment) => payment.user_id === beto.id),
      subscriptionSnapshotError?.message,
    );

    const { error: directSubscription } = await asBeto
      .from("saas_subscriptions")
      .insert({
        user_id: beto.id,
        plan_id: proPlan?.id,
        status: "active",
      });
    check(
      "Beto NO puede fabricarse una suscripción",
      Boolean(directSubscription),
    );

    const { error: directBillingPayment } = await asBeto
      .from("saas_billing_payments")
      .insert({
        user_id: beto.id,
        price_id: proPrice?.id,
        provider: "wompi",
        idempotency_key: `cero_${"a".repeat(32)}`,
        amount: 10_000,
        currency: "COP",
      });
    check(
      "Beto NO puede fabricar un cobro SaaS",
      Boolean(directBillingPayment),
    );

    const { error: clientWompiProcessor } = await asBeto.rpc(
      "process_wompi_saas_payment",
      {
        p_reference: `cero_${"a".repeat(32)}`,
        p_provider_payment_id: "fake-transaction",
        p_external_event_id: "fake-event",
        p_amount: 10_000,
        p_currency: "COP",
        p_paid_at: new Date().toISOString(),
      },
    );
    check(
      "El procesador Wompi NO es invocable por clientes",
      Boolean(clientWompiProcessor),
    );

    const billingProofPath = `${beto.id}/manual-rls.png`;
    const fakeBillingPng = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const { error: ownProofUpload } = await asBeto.storage
      .from("saas-payment-proofs")
      .upload(billingProofPath, fakeBillingPng, { contentType: "image/png" });
    check("Beto sube su comprobante SaaS privado", !ownProofUpload, ownProofUpload?.message);
    if (!ownProofUpload) billingProofPaths.push(billingProofPath);

    const { error: foreignProofUpload } = await asBeto.storage
      .from("saas-payment-proofs")
      .upload(`${ana.id}/spoof.png`, fakeBillingPng, { contentType: "image/png" });
    check("Beto NO sube comprobantes en la carpeta de Ana", Boolean(foreignProofUpload));

    const { data: manualPayment, error: manualPaymentError } = await admin
      .from("saas_billing_payments")
      .insert({
        user_id: beto.id,
        price_id: proPrice?.id,
        provider: "bre-b",
        idempotency_key: `breb_${STAMP}`,
        amount: 10_000,
        currency: "COP",
        proof_path: billingProofPath,
        proof_name: "manual-rls.png",
        proof_mime: "image/png",
        proof_size: fakeBillingPng.byteLength,
      })
      .select("id")
      .single();
    check(
      "La acción segura registra un comprobante pendiente",
      !manualPaymentError && Boolean(manualPayment),
      manualPaymentError?.message,
    );

    const { data: ownManualPayment } = await asBeto
      .from("saas_billing_payments")
      .select("id,status")
      .eq("id", manualPayment?.id);
    check(
      "Beto ve su cobro, pero no puede alterarlo",
      ownManualPayment?.[0]?.status === "pending",
    );

    const { error: approveManualError } = await asAna.rpc(
      "admin_review_saas_payment",
      {
        p_payment_id: manualPayment?.id,
        p_approve: true,
        p_reason: "Comprobante válido en verificación controlada",
      },
    );
    const { data: approvedManual } = await asBeto
      .from("saas_billing_payments")
      .select("status")
      .eq("id", manualPayment?.id)
      .single();
    check(
      "El admin aprueba y activa el pago en una sola transacción",
      !approveManualError && approvedManual?.status === "succeeded",
      approveManualError?.message,
    );

    const { error: foreignAdminAction } = await asBeto.rpc(
      "admin_set_subscription",
      {
        p_user_id: beto.id,
        p_plan_id: proPlan?.id,
        p_status: "trialing",
        p_access_until: "2026-09-30T23:59:59Z",
        p_reason: "Intento no autorizado de prueba",
      },
    );
    check(
      "Beto NO puede invocar una mutación administrativa",
      Boolean(foreignAdminAction),
    );

    const { error: foreignPlanAction } = await asBeto.rpc("admin_update_plan", {
      p_plan_id: proPlan?.id,
      p_name: "CERO Pro",
      p_description: "Acceso mensual completo, productos ilimitados y análisis inteligente.",
      p_trial_days: 0,
      p_is_public: true,
      p_ai_insights: true,
      p_monthly_price: 10_000,
      p_reason: "Intento no autorizado de modificar el plan",
    });
    check("Beto NO puede cambiar el precio ni las funciones del plan", Boolean(foreignPlanAction));

    const { error: planUpdateError } = await asAna.rpc("admin_update_plan", {
      p_plan_id: proPlan?.id,
      p_name: proPlan?.name,
      p_description: proPlan?.description,
      p_trial_days: proPlan?.trial_days ?? 0,
      p_is_public: proPlan?.is_public ?? true,
      p_ai_insights: proPlan?.features?.ai_insights === true,
      p_monthly_price: 10_000,
      p_reason: "Verificación controlada de configuración del plan",
    });
    check("Ana puede cambiar el plan mediante el RPC auditado", !planUpdateError,
      planUpdateError?.message);

    const { data: subscriptionId, error: subscriptionError } = await asAna.rpc(
      "admin_set_subscription",
      {
        p_user_id: beto.id,
        p_plan_id: proPlan?.id,
        p_status: "trialing",
        p_access_until: "2026-09-30T23:59:59Z",
        p_reason: "Prueba controlada por verificación RLS",
      },
    );
    check(
      "Ana asigna una prueba mediante una transacción auditada",
      !subscriptionError && Boolean(subscriptionId),
      subscriptionError?.message,
    );

    const { data: ownSubscription } = await asBeto
      .from("saas_subscriptions")
      .select("id,status")
      .eq("id", subscriptionId);
    check(
      "Beto ve su propia suscripción",
      ownSubscription?.[0]?.status === "trialing",
    );

    const { data: nowVisiblePro } = await asBeto
      .from("saas_plans")
      .select("id")
      .eq("code", "pro");
    check(
      "Beto puede leer el plan privado que le fue asignado",
      nowVisiblePro?.[0]?.id === proPlan?.id,
    );

    const { data: hiddenAudit } = await asBeto
      .from("admin_audit_log")
      .select("id");
    check(
      "Beto NO ve la auditoría administrativa",
      (hiddenAudit ?? []).length === 0,
    );

    const { error: promoteError } = await asAna.rpc("admin_set_user_role", {
      p_user_id: beto.id,
      p_role: "admin",
      p_reason: "Verificación temporal del cambio auditado",
    });
    const { error: demoteError } = await asAna.rpc("admin_set_user_role", {
      p_user_id: beto.id,
      p_role: "user",
      p_reason: "Fin de la verificación temporal del rol",
    });
    check(
      "Los cambios de rol pasan por el RPC auditado",
      !promoteError && !demoteError,
      promoteError?.message ?? demoteError?.message,
    );

    const { data: auditRows } = await asAna
      .from("admin_audit_log")
      .select("action,reason")
      .eq("actor_user_id", ana.id);
    check(
      "Cada cambio administrativo deja motivo en auditoría",
      (auditRows ?? []).length >= 4 &&
        auditRows.every((event) => event.reason.length >= 10),
      `devolvió ${auditRows?.length ?? 0} eventos`,
    );

    const { error: mutateAudit } = await asAna
      .from("admin_audit_log")
      .update({ reason: "Alteración del historial" })
      .eq("actor_user_id", ana.id);
    check(
      "Ni un admin puede modificar la auditoría",
      Boolean(mutateAudit),
    );

    const { data: metrics, error: metricsError } = await asAna.rpc(
      "admin_billing_metrics",
    );
    check(
      "Las métricas del backoffice salen de PostgreSQL",
      !metricsError && Number(metrics?.[0]?.total_users) >= 2,
      metricsError?.message,
    );
  }

  console.log("\nSin sesión");
  {
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await anon.from("credits").select("id");
    check(
      "Un visitante sin sesión no lee nada",
      Boolean(error) || (data ?? []).length === 0,
    );
  }

  // Limpieza del escenario (las cascadas se llevan plan, pagos y actividad).
  await admin
    .from("credits")
    .delete()
    .in("id", [shared, anaPrivate, betoPrivate]);
  if (card) await admin.from("revolving_accounts").delete().eq("id", card.id);
  await admin.from("admin_audit_log").delete().eq("actor_user_id", people[0].id);
  if (storagePaths.length > 0) {
    await admin.storage.from("payment-receipts").remove(storagePaths);
  }
  if (billingProofPaths.length > 0) {
    await admin.storage.from("saas-payment-proofs").remove(billingProofPaths);
  }
} catch (e) {
  failed++;
  console.error(`\n✗ El escenario falló: ${e.message}`);
} finally {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

console.log(
  `\n${failed === 0 ? "✓" : "✗"} ${passed} comprobaciones pasaron, ${failed} fallaron.`,
);
process.exit(failed === 0 ? 0 : 1);
