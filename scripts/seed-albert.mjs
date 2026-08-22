/**
 * Carga los productos reales de AV Villas.
 *
 *   node scripts/seed-albert.mjs tu@correo.com [correo-de-tu-esposa]
 *
 * Necesita SUPABASE_SERVICE_ROLE_KEY en .env.local (salta las RLS). Por eso
 * vive aquí y no dentro de la aplicación.
 *
 * ---------------------------------------------------------------------------
 * LO QUE RECONCILIA Y LO QUE NO
 * ---------------------------------------------------------------------------
 * Vehículo y Tarjeta salen tal cual de los documentos.
 *
 * El LOTE no cuadra con los contadores del portal. Con $125.643.123 a 48 meses
 * y 20,28 % E.A. (= 1,5507 % m.v.) la cuota daría $3.730.960, pero el banco
 * cobra $3.158.229. Y "9 cuotas pagadas" es incompatible con un desembolso el
 * 19/06/2026: en dos meses no caben nueve.
 *
 * Reconstruyendo desde saldo + cuota + tasa, lo que sí encaja es:
 *   - cuota fija $3.158.229 con PLAZO VARIABLE (IBR), ~62 meses, no 48
 *   - primera cuota 02/07/2026 y sólo 2 cuotas pagadas
 *   - abono a capital de $15.747.921 el 11/07/2026
 *   - resultado: 49 cuotas restantes (coincide exacto con el banco)
 *     y saldo $107.212.404 frente a los $107.865.126 del extracto
 *
 * Quedan $652.722 de diferencia (0,6 %), que son los seguros facturados aparte
 * (Fac. Vida, FNG) y el prorrateo por días reales. CONFIRMA con AV Villas la
 * cuota, el plazo vigente y cuántas cuotas llevas pagadas; ajusta abajo y
 * vuelve a ejecutar.
 * ---------------------------------------------------------------------------
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";

// --- Parámetros del Lote (confírmalos con AV Villas) ------------------------
const LOTE = {
  principal: 125_643_123,
  /** 20,28 % E.A. -> (1,2028)^(1/12) − 1 */
  monthlyRate: 0.0155067,
  /** Plazo que reproduce la cuota de $3.158.229. El pactado (48) no cuadra. */
  termMonths: 62,
  /** Desembolso 19/06/2026 -> primera cuota el 2 de julio. */
  firstPaymentDate: "2026-07-02",
  /** Abono a capital del extracto (movimiento del 11 de julio). */
  extraPrincipal: { amount: 15_747_921, date: "2026-07-11" },
  installmentsPaid: 2,
};

const VEHICULO = {
  principal: 120_332_720,
  monthlyRate: 0.0189, // 1,89 % N.M.V. (= 25,1926 % E.A.)
  termMonths: 72,
  firstPaymentDate: "2026-09-01",
  installmentsPaid: 0,
};

const TARJETA = {
  name: "Tarjeta AV Villas",
  entity: "AV Villas",
  lastFour: "0074",
  creditLimit: 22_000_000,
  balance: 2_750_168,
  statementDay: 10,
  dueDay: 1,
  statement: {
    statementDate: "2026-08-10",
    dueDate: "2026-09-01",
    totalDue: 2_750_168,
    minimumDue: 930_935,
    reducedMinimumDue: 97_119,
  },
};

// --- Entorno ----------------------------------------------------------------
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // El archivo puede no existir.
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const args = process.argv.slice(2).filter((a) => a !== "--reset");
const [ownerEmail, partnerEmail] = args;
/** Borra los créditos y tarjetas del usuario antes de cargar. */
const reset = process.argv.includes("--reset");

if (!url || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}
if (!ownerEmail) {
  console.error(
    "Uso: node scripts/seed-albert.mjs tu@correo.com [correo-de-tu-esposa] [--reset]",
  );
  process.exit(1);
}

// --- Motor de amortización (el mismo que usa el servidor) -------------------
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
});
const { buildSchedule, replaySchedule } = await vite.ssrLoadModule(
  "/src/core/domain/amortization.ts",
);

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fmt = (n) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);

async function findUser(email) {
  const { data, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw new Error(error.message);
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

const owner = await findUser(ownerEmail);
if (!owner) {
  console.error(`No existe ningún usuario con el correo ${ownerEmail}.`);
  process.exit(1);
}

// Limpieza opcional: sin ella, volver a ejecutar el script duplicaría los
// créditos en vez de reemplazarlos.
if (reset) {
  const { data: existing } = await db
    .from("credits")
    .select("id, name")
    .eq("owner_id", owner.id);
  const { data: existingCards } = await db
    .from("revolving_accounts")
    .select("id, name")
    .eq("owner_id", owner.id);

  for (const row of existing ?? []) console.log(`  − crédito ${row.name}`);
  for (const row of existingCards ?? []) console.log(`  − tarjeta ${row.name}`);

  // El plan, los pagos y la actividad se van en cascada.
  await db.from("credits").delete().eq("owner_id", owner.id);
  await db.from("revolving_accounts").delete().eq("owner_id", owner.id);
  await db.from("activity").delete().eq("user_id", owner.id);
}

const partner = partnerEmail ? await findUser(partnerEmail) : null;
if (partnerEmail && !partner) {
  console.error(
    `Aviso: ${partnerEmail} no tiene cuenta todavía. Los créditos se crean sin compartir.`,
  );
}

/**
 * Crea el crédito y registra su historial. El plan lo deriva luego la propia
 * app (o el botón "Reconstruir plan" del backoffice), así que aquí sólo se
 * insertan los hechos: el crédito y sus pagos.
 */
async function createCredit(spec) {
  const { data: credit, error } = await db
    .from("credits")
    .insert({
      owner_id: owner.id,
      name: spec.name,
      type: spec.type,
      entity: "AV Villas",
      principal_amount: spec.principal,
      interest_rate_monthly: spec.monthlyRate,
      term_months: spec.termMonths,
      amortization_system: "french",
      extra_principal_mode: "reduce_term",
      first_payment_date: spec.firstPaymentDate,
      currency: "COP",
      status: "active",
      notes: spec.notes ?? null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`${spec.name}: ${error.message}`);

  // Historial: las cuotas ya pagadas, con su importe programado.
  const plan = buildSchedule({
    principal: spec.principal,
    monthlyRate: spec.monthlyRate,
    termMonths: spec.termMonths,
    system: "french",
    firstPaymentDate: spec.firstPaymentDate,
  });

  const events = plan.slice(0, spec.installmentsPaid).map((row, i) => ({
    credit_id: credit.id,
    user_id: owner.id,
    installment_number: i + 1,
    payment_date: row.dueDate,
    amount_paid: row.payment,
    principal_paid: 0,
    interest_paid: 0,
    extra_principal: 0,
  }));

  if (spec.extraPrincipal) {
    events.push({
      credit_id: credit.id,
      user_id: owner.id,
      installment_number: null,
      payment_date: spec.extraPrincipal.date,
      amount_paid: 0,
      principal_paid: 0,
      interest_paid: 0,
      extra_principal: spec.extraPrincipal.amount,
    });
  }

  if (events.length > 0) {
    const { error: paymentsError } = await db.from("payments").insert(events);
    if (paymentsError) throw new Error(`${spec.name}: ${paymentsError.message}`);
  }

  // Cronograma: se deriva aquí con el MISMO motor que usa el servidor, para no
  // dejar el crédito a medias esperando un botón. Es exactamente lo que hace
  // `rebuildCreditSchedule`.
  const replay = replaySchedule({
    principal: spec.principal,
    monthlyRate: spec.monthlyRate,
    termMonths: spec.termMonths,
    system: "french",
    firstPaymentDate: spec.firstPaymentDate,
    mode: "reduce_term",
    events: events.map((e) => ({
      id: `${e.payment_date}-${e.amount_paid}-${e.extra_principal}`,
      date: e.payment_date,
      settlesInstallment: e.amount_paid > 0,
      amountPaid: e.amount_paid,
      extraPrincipal: e.extra_principal,
    })),
  });

  const money = (n) => Math.round(n * 100) / 100;

  const { error: scheduleError } = await db.from("credit_schedule").insert(
    replay.rows.map((row) => ({
      credit_id: credit.id,
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
    })),
  );
  if (scheduleError) throw new Error(`${spec.name}: ${scheduleError.message}`);

  // Imputación real de cada pago (interés / capital), como en el servidor.
  const paymentRows = await db
    .from("payments")
    .select("id, payment_date, amount_paid, extra_principal")
    .eq("credit_id", credit.id)
    .order("payment_date", { ascending: true })
    .order("created_at", { ascending: true });

  for (const [i, allocation] of replay.allocations.entries()) {
    const row = paymentRows.data?.[i];
    if (!row) continue;
    await db
      .from("payments")
      .update({
        installment_number: allocation.installment,
        principal_paid: money(allocation.principalPaid),
        interest_paid: money(allocation.interestPaid),
        extra_principal: money(allocation.extraPrincipal),
        balance_after: money(allocation.balanceAfter),
      })
      .eq("id", row.id);
  }

  if (replay.settled) {
    await db.from("credits").update({ status: "paid" }).eq("id", credit.id);
  }

  if (partner) {
    await db
      .from("credit_members")
      .insert({ credit_id: credit.id, user_id: partner.id, role: "member" })
      .then(({ error: e }) => {
        if (e && e.code !== "23505") console.error(`  compartir: ${e.message}`);
      });
  }

  console.log(
    `✓ ${spec.name.padEnd(10)} saldo ${fmt(replay.balance).padStart(13)} · ` +
      `${replay.rows.filter((r) => r.paid).length} pagadas / ` +
      `${replay.rows.filter((r) => !r.paid).length} restantes` +
      (partner ? " · compartido" : ""),
  );
  return { credit, replay };
}

await createCredit({
  ...VEHICULO,
  name: "Vehículo",
  type: "vehicle",
  notes: "Crédito de vehículo AV Villas · tasa variable IBR + puntos",
});

const lote = await createCredit({
  ...LOTE,
  name: "Lote",
  type: "property",
  notes:
    "Crédito 35039446 · cuota fija con plazo variable (IBR). Plazo modelado en " +
    `${LOTE.termMonths} meses para reproducir la cuota del banco.`,
});

// --- Tarjeta ---------------------------------------------------------------
const { data: card, error: cardError } = await db
  .from("revolving_accounts")
  .insert({
    owner_id: owner.id,
    name: TARJETA.name,
    kind: "credit_card",
    entity: TARJETA.entity,
    last_four: TARJETA.lastFour,
    credit_limit: TARJETA.creditLimit,
    statement_day: TARJETA.statementDay,
    due_day: TARJETA.dueDay,
    currency: "COP",
    status: "active",
  })
  .select("id")
  .single();

if (cardError) {
  console.error(`✗ ${TARJETA.name}: ${cardError.message}`);
} else {
  await db.from("revolving_movements").insert({
    account_id: card.id,
    user_id: owner.id,
    kind: "charge",
    amount: TARJETA.balance,
    movement_date: TARJETA.statement.statementDate,
    description: "Cupo usado al registrar la tarjeta",
  });

  await db.from("revolving_statements").insert({
    account_id: card.id,
    statement_date: TARJETA.statement.statementDate,
    due_date: TARJETA.statement.dueDate,
    total_due: TARJETA.statement.totalDue,
    minimum_due: TARJETA.statement.minimumDue,
    reduced_minimum_due: TARJETA.statement.reducedMinimumDue,
    status: "open",
  });

  console.log(`✓ ${TARJETA.name} · cupo usado y extracto cargados`);
}

await vite.close();

console.log(
  [
    "",
    "Listo. Ahora entra a CERO como administrador y pulsa",
    '"Reconstruir plan de pagos" en cada crédito desde Perfil > Administración.',
    "Ese paso deriva el cronograma desde los movimientos que acabas de cargar.",
    "",
    "Después compara el saldo del Lote con tu extracto ($107.865.126).",
    "Si no coincide, ajusta monthlyRate / termMonths arriba y vuelve a ejecutar.",
  ].join("\n"),
);
process.exit(0);
