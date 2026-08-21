/**
 * Datos de ejemplo para DESARROLLO.
 *
 *   node scripts/seed.mjs correo@ejemplo.com
 *
 * Usa la SERVICE_ROLE_KEY, que salta las RLS: por eso vive en un script de
 * consola y jamás se importa desde la app. Nunca ejecutar contra producción.
 *
 * El plan de pagos se genera con el MISMO motor que usa el servidor
 * (src/core/domain/amortization.ts), cargado con Vite para no duplicar en
 * JavaScript unas fórmulas que ya están escritas y testeadas en TypeScript.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createServer } from "vite";

// --- Variables de entorno ---------------------------------------------------
for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // El archivo puede no existir: las variables pueden venir del entorno.
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];

if (!url || !serviceKey) {
  console.error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local",
  );
  process.exit(1);
}
if (!email) {
  console.error("Uso: node scripts/seed.mjs correo@ejemplo.com");
  process.exit(1);
}

// --- Motor de amortización (TypeScript, cargado por Vite) -------------------
const vite = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "warn",
  // El motor importa "@/lib/dates": hay que resolver el alias tambien aqui.
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
});
const { buildSchedule } = await vite.ssrLoadModule(
  "/src/core/domain/amortization.ts",
);

const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// --- Usuario destino --------------------------------------------------------
const { data: list, error: listError } = await db.auth.admin.listUsers({
  perPage: 1000,
});
if (listError) {
  console.error("No pudimos listar usuarios:", listError.message);
  process.exit(1);
}

const user = list.users.find(
  (u) => u.email?.toLowerCase() === email.toLowerCase(),
);
if (!user) {
  console.error(
    `No existe ningún usuario con el correo ${email}. Créalo primero desde el panel de Supabase.`,
  );
  process.exit(1);
}

// --- Créditos de referencia (los del mockup) --------------------------------
const CREDITS = [
  {
    name: "Carro",
    type: "vehicle",
    entity: "Banco",
    principal_amount: 120_000_000,
    interest_rate_monthly: 0.0189,
    term_months: 72,
    amortization_system: "french",
    first_payment_date: "2026-09-01",
  },
  {
    name: "Lote",
    type: "property",
    entity: "Constructora",
    principal_amount: 98_000_000,
    interest_rate_monthly: 0.0145,
    term_months: 48,
    amortization_system: "french",
    first_payment_date: "2026-09-15",
  },
  {
    name: "Papeles del carro",
    type: "free_investment",
    entity: "Banco",
    principal_amount: 25_000_000,
    interest_rate_monthly: 0.021,
    term_months: 24,
    amortization_system: "french",
    first_payment_date: "2026-09-05",
  },
];

for (const credit of CREDITS) {
  const { data: inserted, error } = await db
    .from("credits")
    .insert({ ...credit, owner_id: user.id, currency: "COP", status: "active" })
    .select("id")
    .single();

  if (error) {
    console.error(`✗ ${credit.name}: ${error.message}`);
    continue;
  }

  const rows = buildSchedule({
    principal: credit.principal_amount,
    monthlyRate: credit.interest_rate_monthly,
    termMonths: credit.term_months,
    system: credit.amortization_system,
    firstPaymentDate: credit.first_payment_date,
  });

  const { error: scheduleError } = await db.from("credit_schedule").insert(
    rows.map((r) => ({
      credit_id: inserted.id,
      installment_number: r.installment,
      due_date: r.dueDate,
      opening_balance: r.openingBalance,
      payment_amount: r.payment,
      interest_amount: r.interest,
      principal_amount: r.principal,
      closing_balance: r.closingBalance,
    })),
  );

  if (scheduleError) {
    console.error(`✗ plan de ${credit.name}: ${scheduleError.message}`);
    continue;
  }

  await db.from("activity").insert({
    user_id: user.id,
    credit_id: inserted.id,
    type: "credit_created",
    title: "Crédito creado",
    description: credit.name,
    amount: credit.principal_amount,
  });

  console.log(`✓ ${credit.name} · ${rows.length} cuotas`);
}

await vite.close();
console.log(`\nListo. Datos de ejemplo cargados para ${email}.`);
process.exit(0);
