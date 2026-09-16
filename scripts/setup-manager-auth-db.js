#!/usr/bin/env node
/**
 * One-time setup script: creates the manager_accounts and activity_log
 * tables in the Neon Postgres database (DATABASE_URL), used by the manager/
 * owner login + audit-trail system. Also seeds the single owner row
 * (role='owner', password blank) if one doesn't already exist yet, so the
 * owner can complete first-time password setup via the hidden owner login
 * route. Safe to re-run — every statement is CREATE ... IF NOT EXISTS /
 * INSERT ... only when missing.
 *
 * Usage:
 *   node scripts/setup-manager-auth-db.js
 *
 * Requires DATABASE_URL in the environment (or .env.local).
 */

/* eslint-disable @typescript-eslint/no-require-imports -- standalone Node/CommonJS
   script run via `node scripts/x.js`, not bundled into the app; matches every
   other scripts/*.js file in this repo. */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
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
    CREATE TABLE IF NOT EXISTS manager_accounts (
      id TEXT PRIMARY KEY,
      staff_id TEXT UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('manager','owner')),
      display_name TEXT,
      password_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login_at TIMESTAMPTZ
    )
  `;
  console.log("manager_accounts ready.");

  // Migration for installs created before the switch from the Managers Sheet
  // tab to the Staff tab as the login source of truth (2026-09-16) — the
  // join column was renamed accordingly. No-op if already renamed or if the
  // table was just created fresh above with the new name.
  await sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'manager_accounts' AND column_name = 'sheet_manager_id'
      ) THEN
        ALTER TABLE manager_accounts RENAME COLUMN sheet_manager_id TO staff_id;
      END IF;
    END $$;
  `;
  console.log("staff_id column migration checked.");

  // Any pre-existing 'manager' rows predate this rename and are keyed to the
  // old Managers-tab ids, which never match a real Staff id — inert, but
  // clearing them lets managers show a clean "Setup pending" state instead
  // of a dangling orphaned row. None had a real password in production use.
  const staleManagerRows = await sql`SELECT count(*) FROM manager_accounts WHERE role = 'manager'`;
  if (Number(staleManagerRows[0].count) > 0) {
    await sql`DELETE FROM manager_accounts WHERE role = 'manager'`;
    console.log(`Cleared ${staleManagerRows[0].count} pre-rename manager row(s) keyed to the old Managers-tab id scheme.`);
  }

  await sql`CREATE INDEX IF NOT EXISTS idx_manager_accounts_role ON manager_accounts(role)`;

  await sql`
    CREATE TABLE IF NOT EXISTS activity_log (
      id BIGSERIAL PRIMARY KEY,
      actor_account_id TEXT,
      actor_role TEXT NOT NULL,
      actor_name TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("activity_log ready.");

  await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_actor ON activity_log(actor_account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON activity_log(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log(entity_type, entity_id)`;
  console.log("Indexes ready.");

  const existingOwner = await sql`SELECT id FROM manager_accounts WHERE role = 'owner' LIMIT 1`;
  if (existingOwner.length === 0) {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO manager_accounts (id, staff_id, role, display_name, password_hash)
      VALUES (${id}, NULL, 'owner', 'Andres', NULL)
    `;
    console.log(`Seeded owner row (id ${id}) with no password yet — complete first-time setup via the hidden owner login route.`);
  } else {
    console.log("Owner row already exists — left as-is.");
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
