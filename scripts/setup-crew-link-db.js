#!/usr/bin/env node
/**
 * One-time setup for Crew Link (docs/crew-link-spec.md) in the Neon Postgres
 * database (DATABASE_URL). Safe to re-run — every step is IF NOT EXISTS /
 * checks the catalog first.
 *
 * Usage:
 *   node scripts/setup-crew-link-db.js
 *
 * What it changes (approved plan: reuse the Team Hub tables):
 * - checklist_templates: supply_orders_enabled, problem_reports_enabled
 *   (BOOLEAN NOT NULL DEFAULT false) — the two new Crew Link modules. The
 *   checklist module keeps using the Sheets "Checklist Needed" flag.
 * - supply_orders, hub_issues: crew_link_account_id TEXT + reporter_name
 *   TEXT; site_id and crew_id become nullable, with a CHECK that every row
 *   still has either a Team Hub site or a Crew Link account. Existing rows
 *   all have a site, so they already satisfy it; nothing is rewritten.
 */

/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node/CommonJS
   script run via `node scripts/x.js`, not bundled into the app; matches every
   other scripts/*.js file in this repo. */

const fs = require("fs");
const path = require("path");
const { neon } = require("@neondatabase/serverless");

function loadEnvLocal() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main() {
  loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Set it in .env.local (or the environment) before running this script.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);

  await sql`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS supply_orders_enabled BOOLEAN NOT NULL DEFAULT false`;
  await sql`ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS problem_reports_enabled BOOLEAN NOT NULL DEFAULT false`;
  console.log("checklist_templates module columns ready.");

  for (const table of ["supply_orders", "hub_issues"]) {
    // Table names can't be bound parameters; both come from the fixed list above.
    await sql.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS crew_link_account_id TEXT`);
    await sql.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS reporter_name TEXT`);
    await sql.query(`ALTER TABLE ${table} ALTER COLUMN site_id DROP NOT NULL`);
    await sql.query(`ALTER TABLE ${table} ALTER COLUMN crew_id DROP NOT NULL`);
    const constraintName = `${table}_site_or_crew_link`;
    const existing = await sql`SELECT 1 FROM pg_constraint WHERE conname = ${constraintName}`;
    if (existing.length === 0) {
      await sql.query(
        `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} CHECK (site_id IS NOT NULL OR crew_link_account_id IS NOT NULL)`
      );
    }
    await sql.query(`CREATE INDEX IF NOT EXISTS idx_${table}_crew_link_account ON ${table}(crew_link_account_id)`);
    console.log(`${table} Crew Link columns ready.`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
