#!/usr/bin/env node
/**
 * Crew Link "Other supplies not on the list": adds supply_orders.other_items
 * (TEXT, nullable) — free text the crew writes in for items that aren't in
 * supply_items. Additive only; existing rows get NULL. Safe to re-run.
 *
 * Usage:
 *   node scripts/setup-supply-other-items-db.js           # read-only dry run (default)
 *   node scripts/setup-supply-other-items-db.js --apply   # add the column
 *
 * Apply BEFORE deploying the code that writes other_items.
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

async function report(sql) {
  const columns = await sql`
    SELECT data_type, is_nullable FROM information_schema.columns
    WHERE table_name = 'supply_orders' AND column_name = 'other_items'
  `;
  const [{ count: orders }] = await sql`SELECT COUNT(*)::int AS count FROM supply_orders`;
  console.log(
    `supply_orders.other_items exists: ${columns.length > 0}${
      columns.length > 0 ? ` (${columns[0].data_type}, nullable: ${columns[0].is_nullable})` : ""
    }`
  );
  console.log(`supply_orders rows (unchanged either way): ${orders}`);
}

async function main() {
  loadEnvLocal();

  if (!process.env.DATABASE_URL) {
    console.error("Missing DATABASE_URL. Set it in .env.local (or the environment) before running this script.");
    process.exit(1);
  }

  const sql = neon(process.env.DATABASE_URL);
  const shouldApply = process.argv.includes("--apply");

  console.log(shouldApply ? "== APPLY ==" : "== DRY RUN (read-only) — pass --apply to write ==");
  console.log("-- before --");
  await report(sql);

  if (!shouldApply) return;

  await sql`ALTER TABLE supply_orders ADD COLUMN IF NOT EXISTS other_items TEXT`;
  console.log("-- after --");
  await report(sql);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
