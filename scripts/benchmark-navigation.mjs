/**
 * Medición reproducible de Auth y páginas privadas contra la base real.
 * Crea una cuenta temporal, nunca imprime tokens y la elimina al finalizar.
 *
 *   node scripts/benchmark-navigation.mjs http://localhost:3210
 */
import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

for (const file of [".env.local", ".env"]) {
  try {
    for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
      const match = /^([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line.trim());
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Archivo opcional.
  }
}

const baseUrl = process.argv[2] ?? "http://localhost:3000";
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !anonKey || !serviceRole) {
  throw new Error("Faltan variables de Supabase.");
}

const admin = createClient(supabaseUrl, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const stamp = Date.now();
const email = `cero-perf-${stamp}@example.com`;
const password = `Perf-${stamp}-Secure!`;
let userId;

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.floor(ordered.length / 2)];
}

async function timed(operation) {
  const start = performance.now();
  await operation();
  return Math.round((performance.now() - start) * 10) / 10;
}

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: "Prueba de rendimiento" },
  });
  if (createError) throw createError;
  userId = created.user.id;

  const jar = new Map();
  const sessionClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  const { data: signedIn, error: signInError } = await sessionClient.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError || !signedIn.session) throw signInError ?? new Error("Sin sesión");

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const token = signedIn.session.access_token;
  await authClient.auth.getClaims(token); // Calienta JWKS.

  const getClaimsTimes = [];
  const getUserTimes = [];
  for (let i = 0; i < 5; i++) {
    getClaimsTimes.push(await timed(() => authClient.auth.getClaims(token)));
    getUserTimes.push(await timed(() => authClient.auth.getUser(token)));
  }

  const cookieHeader = [...jar]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
  const routes = ["/inicio", "/creditos", "/presupuesto", "/perfil", "/suscripcion"];
  const routeResults = [];

  for (const route of routes) {
    await fetch(`${baseUrl}${route}`, { headers: { cookie: cookieHeader } });
    const samples = [];
    let status = 0;
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      const response = await fetch(`${baseUrl}${route}`, {
        headers: { cookie: cookieHeader, "cache-control": "no-cache" },
        redirect: "manual",
      });
      status = response.status;
      await response.arrayBuffer();
      samples.push(Math.round((performance.now() - start) * 10) / 10);
    }
    routeResults.push({ route, status, medianMs: median(samples), samplesMs: samples });
  }

  console.log(JSON.stringify({
    authMedianMs: {
      getClaims: median(getClaimsTimes),
      getUser: median(getUserTimes),
    },
    routes: routeResults,
  }, null, 2));
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
