#!/usr/bin/env node
/**
 * One-time setup script: creates every table in the Team Hub data model
 * (see the approved spec) in the Neon Postgres database (DATABASE_URL).
 * Safe to re-run — every statement is CREATE ... IF NOT EXISTS. Written
 * for the WHOLE approved data model now (cheaper than one migration per
 * phase), but Phase 0's application code only touches hub_sites,
 * hub_crews, hub_workers, hub_crew_modules, hub_checklist_library,
 * hub_round_library, supply_items, and hub_crew_items — the rest sit
 * unused until their phase.
 *
 * Usage:
 *   node scripts/setup-team-hub-db.js
 *
 * Requires DATABASE_URL in the environment (or .env.local) — set
 * automatically by `vercel integration add neon` + `vercel env pull`.
 *
 * ── Flagged deviations from the literal spec field lists ──────────────────
 * 1. hub_checklist_run_items gets an `id SERIAL PRIMARY KEY` that the
 *    spec's own field list for this table doesn't mention (it lists only
 *    run_id, crew_item_id, status, note, worker_id, updated_at). This is
 *    required for correctness: hub_issues.run_item_id is a nullable FK
 *    the spec DOES list, and a single-column FK needs a single-column
 *    primary key to point at — a composite (run_id, crew_item_id) key
 *    can't be referenced by one column. Added a UNIQUE(run_id,
 *    crew_item_id) constraint to preserve "one row per item per run."
 * 2. hub_requests.status CHECK (open/done/cancelled) and
 *    hub_photos.parent_type CHECK (issue/run_item/round_check/handoff/
 *    request_completion) — both confirmed and specified after Phase 0's
 *    review (the original spec named these fields without enumerating
 *    values). Reviewed every request-status transition and photo-
 *    attachment point described in the spec's sections 3 and 7; found no
 *    other values either list needs.
 * 3. hub_requests.portal_request_id is created as specified (nullable
 *    TEXT) but per instruction 9: the customer-portal inbox
 *    (listPortalSubmissions in lib/googleSheets.ts) only has `sheetRow`,
 *    not a stable id — sheetRow shifts if rows are inserted/deleted above
 *    it, so it must never be stored here. This column exists in the
 *    schema but nothing will populate it until Phase 3 decides how to get
 *    a real stable id (or, per instruction 9, falls back to storing a
 *    text snapshot instead — a decision for that phase, not this script).
 * 4. hub_issues.category stores "access" (not "access/lock" verbatim)
 *    for the access/lock category — "access/lock" is treated as this
 *    value's display label, not its stored form, matching the equivalent
 *    choice already made in the archived Site Supply Link code.
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

  // ── Phase 0 tables ────────────────────────────────────────────────────

  // account_id/sub_id are the Sheets-side stable slug ids (e.g. "adam-
  // hall-north-america") — plain TEXT, never a foreign key (Accounts/Subs
  // live in Sheets, not this database), and this table NEVER stores the
  // account's name, address, or any other Sheets-sourced field (instruction
  // 8) — only the id. One Team Hub per account (UNIQUE account_id) to match
  // "create/deactivate Team Hub" (singular) in the admin spec.
  await sql`
    CREATE TABLE IF NOT EXISTS hub_sites (
      id SERIAL PRIMARY KEY,
      account_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      supervisor_phone TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("hub_sites ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS hub_crews (
      id SERIAL PRIMARY KEY,
      site_id INT NOT NULL REFERENCES hub_sites(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      crew_type TEXT NOT NULL CHECK (crew_type IN ('porter','night','other')),
      crew_kind TEXT NOT NULL CHECK (crew_kind IN ('sub','inhouse')),
      sub_id TEXT,
      token TEXT NOT NULL UNIQUE,
      token_version INT NOT NULL DEFAULT 1,
      active BOOLEAN NOT NULL DEFAULT true,
      revoked_at TIMESTAMPTZ
    )
  `;
  console.log("hub_crews ready.");

  // Table created now (Phase 0) though the admin UI for creating/managing
  // workers ships in Phase 1, per your approved split.
  await sql`
    CREATE TABLE IF NOT EXISTS hub_workers (
      id SERIAL PRIMARY KEY,
      crew_id INT NOT NULL REFERENCES hub_crews(id) ON DELETE CASCADE,
      first_name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      failed_attempts INT NOT NULL DEFAULT 0,
      locked_until TIMESTAMPTZ,
      last_sign_in_at TIMESTAMPTZ,
      last_device TEXT
    )
  `;
  console.log("hub_workers ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS hub_crew_modules (
      crew_id INT NOT NULL REFERENCES hub_crews(id) ON DELETE CASCADE,
      module TEXT NOT NULL CHECK (module IN ('checklist','rounds','handoff','requests','supplies','issues')),
      enabled BOOLEAN NOT NULL DEFAULT true,
      PRIMARY KEY (crew_id, module)
    )
  `;
  console.log("hub_crew_modules ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS hub_checklist_library (
      id SERIAL PRIMARY KEY,
      area TEXT NOT NULL,
      text TEXT NOT NULL,
      default_frequency TEXT NOT NULL CHECK (default_frequency IN ('visit','weekly','monthly')),
      is_note BOOLEAN NOT NULL DEFAULT false,
      active BOOLEAN NOT NULL DEFAULT true
    )
  `;
  console.log("hub_checklist_library ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS hub_round_library (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      default_interval_minutes INT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true
    )
  `;
  console.log("hub_round_library ready.");

  // equipment_part_id is a plain TEXT reference (no FK — Equipment parts
  // live in Sheets today, same reasoning as account_id/sub_id above);
  // nullable since most supply items won't map to a tracked equipment part.
  await sql`
    CREATE TABLE IF NOT EXISTS supply_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unit',
      sort_order INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true,
      equipment_part_id TEXT
    )
  `;
  console.log("supply_items ready.");

  // item_id is intentionally NOT a foreign key — it points at
  // hub_checklist_library, hub_round_library, or supply_items
  // depending on item_type, and Postgres FKs can't target different
  // tables conditionally. Validated at the application layer
  // (lib/teamHubDb.ts) instead.
  await sql`
    CREATE TABLE IF NOT EXISTS hub_crew_items (
      id SERIAL PRIMARY KEY,
      crew_id INT NOT NULL REFERENCES hub_crews(id) ON DELETE CASCADE,
      item_type TEXT NOT NULL CHECK (item_type IN ('checklist','round','supply')),
      item_id INT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT true,
      frequency_override TEXT CHECK (frequency_override IN ('visit','weekly','monthly')),
      instance_label TEXT,
      sort_order INT NOT NULL DEFAULT 0
    )
  `;
  console.log("hub_crew_items ready.");

  await sql`CREATE INDEX IF NOT EXISTS idx_hub_sites_account ON hub_sites(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_crews_site ON hub_crews(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_workers_crew ON hub_workers(crew_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_crew_items_crew ON hub_crew_items(crew_id)`;
  console.log("Phase 0 indexes ready.");

  // ── Later-phase tables (created now, unused until their phase) ────────

  await sql`
    CREATE TABLE IF NOT EXISTS hub_checklist_runs (
      id SERIAL PRIMARY KEY,
      crew_id INT NOT NULL REFERENCES hub_crews(id) ON DELETE CASCADE,
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      submitted_at TIMESTAMPTZ,
      started_by_worker_id INT REFERENCES hub_workers(id)
    )
  `;

  // See "Flagged deviations" #1 above re: the id + UNIQUE constraint.
  await sql`
    CREATE TABLE IF NOT EXISTS hub_checklist_run_items (
      id SERIAL PRIMARY KEY,
      run_id INT NOT NULL REFERENCES hub_checklist_runs(id) ON DELETE CASCADE,
      crew_item_id INT NOT NULL REFERENCES hub_crew_items(id),
      status TEXT NOT NULL CHECK (status IN ('done','na','problem')),
      note TEXT NOT NULL DEFAULT '',
      worker_id INT REFERENCES hub_workers(id),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (run_id, crew_item_id)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS hub_round_checks (
      id SERIAL PRIMARY KEY,
      crew_item_id INT NOT NULL REFERENCES hub_crew_items(id),
      worker_id INT REFERENCES hub_workers(id),
      checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      note TEXT NOT NULL DEFAULT ''
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS hub_handoffs (
      id SERIAL PRIMARY KEY,
      site_id INT NOT NULL REFERENCES hub_sites(id) ON DELETE CASCADE,
      from_crew_id INT NOT NULL REFERENCES hub_crews(id),
      to_crew_id INT NOT NULL REFERENCES hub_crews(id),
      worker_id INT REFERENCES hub_workers(id),
      text TEXT NOT NULL DEFAULT '',
      needs_action BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
      closed_by_worker_id INT REFERENCES hub_workers(id),
      closed_at TIMESTAMPTZ,
      close_note TEXT,
      read_at TIMESTAMPTZ
    )
  `;

  // todo_id/portal_request_id are plain TEXT, no FK (To-Do and the portal
  // inbox both live in Sheets). See "Flagged deviations" #3 re:
  // portal_request_id specifically.
  await sql`
    CREATE TABLE IF NOT EXISTS hub_requests (
      id SERIAL PRIMARY KEY,
      site_id INT NOT NULL REFERENCES hub_sites(id) ON DELETE CASCADE,
      crew_id INT NOT NULL REFERENCES hub_crews(id),
      title TEXT NOT NULL,
      details TEXT NOT NULL DEFAULT '',
      due_at TIMESTAMPTZ,
      photo_required BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
      todo_id TEXT,
      portal_request_id TEXT,
      created_by TEXT,
      completed_by_worker_id INT REFERENCES hub_workers(id),
      completed_at TIMESTAMPTZ,
      completion_note TEXT
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS supply_orders (
      id SERIAL PRIMARY KEY,
      site_id INT NOT NULL REFERENCES hub_sites(id) ON DELETE CASCADE,
      crew_id INT NOT NULL REFERENCES hub_crews(id),
      worker_id INT REFERENCES hub_workers(id),
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','ordered','delivered','cancelled')),
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS supply_order_lines (
      order_id INT NOT NULL REFERENCES supply_orders(id) ON DELETE CASCADE,
      item_id INT NOT NULL REFERENCES supply_items(id),
      qty INT NOT NULL CHECK (qty > 0),
      PRIMARY KEY (order_id, item_id)
    )
  `;

  // run_item_id references hub_checklist_run_items' id (see deviation #1
  // above); complaint_id is plain TEXT matching appendComplaint's stable
  // "COMP-<timestamp>" id format in lib/googleSheets.ts (not a Sheets row
  // number). category stores "access" for "access/lock" — see deviation #4.
  await sql`
    CREATE TABLE IF NOT EXISTS hub_issues (
      id SERIAL PRIMARY KEY,
      site_id INT NOT NULL REFERENCES hub_sites(id) ON DELETE CASCADE,
      crew_id INT NOT NULL REFERENCES hub_crews(id),
      worker_id INT REFERENCES hub_workers(id),
      category TEXT NOT NULL CHECK (category IN ('restroom','trash','damage','leak','access','supplies','safety','other')),
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
      run_item_id INT REFERENCES hub_checklist_run_items(id),
      complaint_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    )
  `;

  // parent_id is intentionally NOT a foreign key — it points at hub_issues,
  // hub_checklist_run_items, hub_round_checks, hub_handoffs, or
  // hub_requests depending on parent_type, and Postgres FKs can't target
  // different tables conditionally (same reasoning as hub_crew_items.item_id
  // above). "request_completion" (not "request") since the spec only
  // mentions a photo at request COMPLETION time, not at creation.
  await sql`
    CREATE TABLE IF NOT EXISTS hub_photos (
      id SERIAL PRIMARY KEY,
      parent_type TEXT NOT NULL CHECK (parent_type IN ('issue','run_item','round_check','handoff','request_completion')),
      parent_id INT NOT NULL,
      blob_url TEXT NOT NULL,
      worker_id INT REFERENCES hub_workers(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  console.log("Later-phase tables ready.");

  await sql`CREATE INDEX IF NOT EXISTS idx_hub_checklist_runs_crew ON hub_checklist_runs(crew_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_checklist_run_items_run ON hub_checklist_run_items(run_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_round_checks_crew_item ON hub_round_checks(crew_item_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_handoffs_site ON hub_handoffs(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_requests_site ON hub_requests(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supply_orders_site ON supply_orders(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supply_order_lines_order ON supply_order_lines(order_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_issues_site ON hub_issues(site_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_hub_photos_parent ON hub_photos(parent_type, parent_id)`;
  console.log("Later-phase indexes ready.");

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
