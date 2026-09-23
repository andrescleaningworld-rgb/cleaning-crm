#!/usr/bin/env node
/**
 * Crew Link redesign, part 1: automatic checklist times. The crew screen no
 * longer asks for Week Of / Time In / Time Out; instead "started" is the
 * crew's first checkbox tap (checklist_submissions.started_at, new) and
 * "finished" is the Send (the existing submitted_at). Old submissions keep
 * their typed time_in / time_out and get NULL here. Additive only; safe to
 * re-run.
 *
 * Usage:
 *   node scripts/setup-checklist-started-at-db.js           # read-only dry run (default)
 *   node scripts/setup-checklist-started-at-db.js --apply   # add the column
 *
 * Apply BEFORE deploying the code that writes started_at.
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
    WHERE table_name = 'checklist_submissions' AND column_name = 'started_at'
  `;
  const [{ count: submissions }] = await sql`SELECT COUNT(*)::int AS count FROM checklist_submissions`;
  console.log(
    `checklist_submissions.started_at exists: ${columns.length > 0}${
      columns.length > 0 ? ` (${columns[0].data_type}, nullable: ${columns[0].is_nullable})` : ""
    }`
  );
  console.log(`checklist_submissions rows (unchanged either way): ${submissions}`);
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

  await sql`ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`;
  console.log("-- after --");
  await report(sql);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
