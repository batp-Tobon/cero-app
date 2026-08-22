import { execSync } from "node:child_process";
import { mkdirSync, readdirSync, statSync, readFileSync, writeFileSync, rmdirSync } from "node:fs";
import { join } from "node:path";

const mv = (from, to) => {
  mkdirSync(to.split("/").slice(0, -1).join("/"), { recursive: true });
  execSync(`git mv "${from}" "${to}"`, { stdio: "pipe" });
};

const moveDir = (from, to) => {
  for (const f of readdirSync(from)) mv(`${from}/${f}`, `${to}/${f}`);
};

// --- componentes: cada dominio con los suyos -------------------------------
moveDir("src/components/ui", "src/shared/ui");
moveDir("src/components/common", "src/shared/components");
moveDir("src/components/layout", "src/shared/components");
for (const f of ["auth","credits","payments","revolving","dashboard","activity","profile","admin"]) {
  moveDir(`src/components/${f}`, `src/features/${f}/components`);
}

// --- servidor: la accion y la consulta viven junto a su dominio ------------
mv("src/server/actions/credits.ts",    "src/features/credits/actions.ts");
mv("src/server/actions/members.ts",    "src/features/credits/members.ts");
mv("src/server/queries/credits.ts",    "src/features/credits/queries.ts");
mv("src/server/services/schedule.ts",  "src/features/credits/schedule.ts");
mv("src/server/actions/payments.ts",   "src/features/payments/actions.ts");
mv("src/server/actions/revolving.ts",  "src/features/revolving/actions.ts");
mv("src/server/queries/revolving.ts",  "src/features/revolving/queries.ts");
mv("src/server/actions/profile.ts",    "src/features/profile/actions.ts");
mv("src/server/actions/admin.ts",      "src/features/admin/actions.ts");
mv("src/server/queries/admin.ts",      "src/features/admin/queries.ts");

// --- transversales --------------------------------------------------------
moveDir("src/lib", "src/shared/lib");
moveDir("src/types", "src/shared/types");
mv("src/core/domain/amortization.ts",      "src/core/amortization.ts");
mv("src/core/domain/amortization.test.ts", "src/core/amortization.test.ts");
mv("src/core/domain/replay.test.ts",       "src/core/replay.test.ts");
mv("src/core/domain/money.ts",             "src/core/money.ts");

for (const d of ["src/components","src/server/actions","src/server/queries","src/server/services","src/server","src/core/domain","src/hooks"]) {
  try { rmdirSync(d, { recursive: true }); } catch {}
}

// --- reescritura de imports ------------------------------------------------
const MAP = [
  ["@/components/ui/",         "@/shared/ui/"],
  ["@/components/common/",     "@/shared/components/"],
  ["@/components/layout/",     "@/shared/components/"],
  ["@/components/auth/",       "@/features/auth/components/"],
  ["@/components/credits/",    "@/features/credits/components/"],
  ["@/components/payments/",   "@/features/payments/components/"],
  ["@/components/revolving/",  "@/features/revolving/components/"],
  ["@/components/dashboard/",  "@/features/dashboard/components/"],
  ["@/components/activity/",   "@/features/activity/components/"],
  ["@/components/profile/",    "@/features/profile/components/"],
  ["@/components/admin/",      "@/features/admin/components/"],
  ["@/server/actions/credits",  "@/features/credits/actions"],
  ["@/server/actions/members",  "@/features/credits/members"],
  ["@/server/queries/credits",  "@/features/credits/queries"],
  ["@/server/services/schedule","@/features/credits/schedule"],
  ["@/server/actions/payments", "@/features/payments/actions"],
  ["@/server/actions/revolving","@/features/revolving/actions"],
  ["@/server/queries/revolving","@/features/revolving/queries"],
  ["@/server/actions/profile",  "@/features/profile/actions"],
  ["@/server/actions/admin",    "@/features/admin/actions"],
  ["@/server/queries/admin",    "@/features/admin/queries"],
  ["@/core/domain/amortization","@/core/amortization"],
  ["@/core/domain/money",       "@/core/money"],
  ["@/lib/",                    "@/shared/lib/"],
  ["@/types/",                  "@/shared/types/"],
];

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (e === "node_modules" || e === ".next" || e === ".git") continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(p)) files.push(p);
  }
})("src");
files.push("scripts/seed.mjs", "scripts/seed-albert.mjs", "vitest.config.ts");

let tocados = 0;
for (const f of files) {
  let s = readFileSync(f, "utf8");
  const antes = s;
  for (const [a, b] of MAP) s = s.split(a).join(b);
  s = s.split("/src/core/domain/amortization.ts").join("/src/core/amortization.ts");
  if (s !== antes) { writeFileSync(f, s); tocados++; }
}
console.log(`imports reescritos en ${tocados} archivos`);
