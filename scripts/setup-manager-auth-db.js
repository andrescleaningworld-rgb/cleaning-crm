#!/usr/bin/env node
/**
 * One-time setup script: creates the manager_accounts and activity_log
 * tables in the Neon Postgres database (DATABASE_URL), used by the manager/
 * owner login + audit-trail system. Also ensures the pre-designated
 * owner's manager_accounts row (keyed to their real Staff-tab id) has
 * role='owner', with password blank if not yet set — there is only one
 * unified login flow (app/api/login), so the owner completes first-time
 * setup the exact same way any manager does, from the same /login picker.
 * Safe to re-run — every statement is CREATE ... IF NOT EXISTS / idempotent
 * upsert-style logic.
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

  // One-time cleanup for the sheet_manager_id -> staff_id rename: any row
  // still keyed to an old Managers-tab id (format "MGR-...") predates the
  // switch to the Staff tab and can never match a real Staff id — inert,
  // but clearing it lets that manager show a clean "Setup pending" state.
  // Scoped specifically to the old "MGR-" prefix so this never touches a
  // real, current Staff-tab-keyed row ("STF-...") on a later re-run.
  const staleManagerRows = await sql`SELECT count(*) FROM manager_accounts WHERE role = 'manager' AND staff_id LIKE 'MGR-%'`;
  if (Number(staleManagerRows[0].count) > 0) {
    await sql`DELETE FROM manager_accounts WHERE role = 'manager' AND staff_id LIKE 'MGR-%'`;
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

  // There is exactly ONE login flow now (see app/api/login) — the owner is
  // not a separate identity, just whichever Staff-tab person's
  // manager_accounts row already has role='owner'. This id is Andrés's real
  // Staff-tab id, confirmed live via GET /api/staff on 2026-09-16. He still
  // picks his name from the same /login picker as any manager and sets/
  // enters a password the same way; this only pre-marks which row grants
  // owner-level access once he does.
  const OWNER_STAFF_ID = "STF-18-27-58-wgy2";

  const existingForStaffId = await sql`SELECT id, role FROM manager_accounts WHERE staff_id = ${OWNER_STAFF_ID} LIMIT 1`;
  // Leftover from the pre-unification design, where the owner was a
  // separate staff_id-less row — migrate it onto the real Staff id instead
  // of keeping two records around.
  const orphanedOwnerRow = await sql`SELECT id FROM manager_accounts WHERE role = 'owner' AND staff_id IS NULL LIMIT 1`;

  if (existingForStaffId.length > 0) {
    if (existingForStaffId[0].role !== "owner") {
      await sql`UPDATE manager_accounts SET role = 'owner', updated_at = now() WHERE staff_id = ${OWNER_STAFF_ID}`;
      console.log(`Promoted the existing manager_accounts row for ${OWNER_STAFF_ID} to role='owner'.`);
    } else {
      console.log("Owner row already correctly linked to the Staff id — left as-is.");
    }
    if (orphanedOwnerRow.length > 0 && orphanedOwnerRow[0].id !== existingForStaffId[0].id) {
      await sql`DELETE FROM manager_accounts WHERE id = ${orphanedOwnerRow[0].id}`;
      console.log("Removed the old separate staff_id-less owner row (now redundant).");
    }
  } else if (orphanedOwnerRow.length > 0) {
    await sql`UPDATE manager_accounts SET staff_id = ${OWNER_STAFF_ID}, updated_at = now() WHERE id = ${orphanedOwnerRow[0].id}`;
    console.log(`Linked the existing owner row to Staff id ${OWNER_STAFF_ID}.`);
  } else {
    const id = crypto.randomUUID();
    await sql`
      INSERT INTO manager_accounts (id, staff_id, role, password_hash)
      VALUES (${id}, ${OWNER_STAFF_ID}, 'owner', NULL)
    `;
    console.log(`Seeded owner row for Staff id ${OWNER_STAFF_ID} with no password yet.`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
