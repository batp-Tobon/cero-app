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

  console.log("\nRoles");
  {
    const { error, count } = await asBeto
      .from("profiles")
      .update({ role: "admin" }, { count: "exact" })
      .eq("id", beto.id);
    check(
      "Beto NO puede ascenderse a admin",
      Boolean(error) || count === 0,
      error ? "" : `actualizó ${count} filas`,
    );

    const { data: check2 } = await admin
      .from("profiles")
      .select("role")
      .eq("id", beto.id)
      .single();
    check("El rol de Beto sigue siendo 'user'", check2?.role === "user");
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
