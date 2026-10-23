// READ-ONLY report: what the daily reminders would do on their first day.
// Sends nothing, pins nothing, writes nothing.
//
//   npx tsx scripts/report/reminders-day-one.mts
//
// Reads the database in DATABASE_URL from .env.local (production) — never the
// practice database (MIGRATION_DATABASE_URL is ignored here). Run it after
// migrations 056-059 are applied. Prints only counts and sub/account names,
// never an address, email or secret.

import fs from "node:fs";

function loadEnv(file: string): void {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
  }
}

// --practice: the practice database instead (to try the report out).
if (process.argv.includes("--practice")) {
  loadEnv(".env.development.local");
  process.env.DATABASE_URL = process.env.MIGRATION_DATABASE_URL ?? "";
  if (/ep-old-unit-auedho5y/.test(process.env.DATABASE_URL)) throw new Error("That is production, not practice.");
}
loadEnv(".env.local");
delete process.env.MIGRATION_DATABASE_URL;
// The sub score as the live app works it out: from the database (Vercel has these set), not Google Sheets.
for (const area of ["SUBS", "ACCOUNTS", "VISITS", "COMPLAINTS"]) process.env[`DATA_SOURCE_${area}`] ??= "postgres";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not in .env.local.");
const host = /@([^/:?]+)/.exec(process.env.DATABASE_URL)?.[1]?.split(".")[0] ?? "?";
console.log(`Reading (read-only): ${host}\n`);

const { planSubInsuranceReminders, subInsuranceReady } = await import("../../lib/pg/sub-insurance");
const { accountRiskFlags } = await import("../../lib/pg/account-risk");
const { listDuePriceReviews, priceReviewReady } = await import("../../lib/pg/price-review");

if (!(await subInsuranceReady())) console.log("Migration 056 is not applied: no insurance numbers.");
else {
  const plan = await planSubInsuranceReminders();
  const byKind = plan.plans.reduce<Record<string, number>>((acc, p) => ({ ...acc, [p.kind]: (acc[p.kind] ?? 0) + 1 }), {});
  console.log(`Insurance reminders to subs on day one: ${plan.plans.length}`);
  for (const [kind, n] of Object.entries(byKind)) console.log(`  ${kind}: ${n}`);
  console.log(`  held back (a COI waiting for approval): ${plan.waiting}`);
  console.log(`  would need one but have no email on file: ${plan.noEmail}`);
}

const flags = await accountRiskFlags();
const levels = { red: 0, yellow: 0, green: 0 };
for (const flag of flags.values()) levels[flag.level] += 1;
console.log(`\nAt risk (active accounts: ${flags.size}): red ${levels.red}, yellow ${levels.yellow}, green ${levels.green}`);

if (!(await priceReviewReady())) console.log("\nMigration 058 is not applied: no price review numbers.");
else console.log(`\nOverdue for a price review (no papers on day one): ${Object.keys(await listDuePriceReviews()).length}`);
