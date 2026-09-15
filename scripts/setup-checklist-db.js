#!/usr/bin/env node
/**
 * One-time setup script: creates the checklist_templates and
 * checklist_submissions tables in the Neon Postgres database (DATABASE_URL),
 * used by the Porter/Cleaning Checklist module. Safe to re-run — every
 * statement is CREATE ... IF NOT EXISTS / CREATE INDEX IF NOT EXISTS.
 *
 * Usage:
 *   node scripts/setup-checklist-db.js
 *
 * Requires DATABASE_URL in the environment (or .env.local) — set
 * automatically by `vercel integration add neon` + `vercel env pull`.
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

  await sql`
    CREATE TABLE IF NOT EXISTS checklist_templates (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE,
      account_name TEXT NOT NULL,
      location_name TEXT NOT NULL DEFAULT '',
      porter_code TEXT NOT NULL UNIQUE,
      sections_json JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("checklist_templates ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS checklist_submissions (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL,
      account_name TEXT NOT NULL,
      location_name TEXT NOT NULL,
      porter_name TEXT NOT NULL,
      week_of DATE,
      time_in TEXT,
      time_out TEXT,
      completed_count INT NOT NULL DEFAULT 0,
      total_count INT NOT NULL DEFAULT 0,
      general_notes TEXT NOT NULL DEFAULT '',
      items_snapshot_json JSONB NOT NULL,
      submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("checklist_submissions ready.");

  await sql`CREATE INDEX IF NOT EXISTS idx_submissions_account ON checklist_submissions(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON checklist_submissions(submitted_at DESC)`;
  console.log("Indexes ready.");

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
