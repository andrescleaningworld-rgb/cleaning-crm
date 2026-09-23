#!/usr/bin/env node
/**
 * Crew Link tabs: each account can have several checklists ("tabs"), each
 * with its own name and sections. Safe to re-run — every step is
 * IF NOT EXISTS, and the backfill only touches accounts with no tab yet /
 * submissions with no tab_id yet.
 *
 * Usage:
 *   node scripts/setup-checklist-tabs-db.js           # read-only dry run (default)
 *   node scripts/setup-checklist-tabs-db.js --apply   # create + backfill
 *
 * What --apply changes (additive only — nothing dropped or renamed):
 * - new table checklist_tabs (soft delete via deleted_at, so past
 *   submissions always point at a row that still exists);
 * - checklist_submissions: tab_id INT (FK) + tab_name TEXT (snapshot);
 * - backfill: every checklist_templates row with no tab gets a "Checklist"
 *   tab copied from its sections_json, and every submission with no tab_id
 *   is linked to its account's first-created tab.
 *
 * Deploy order: dry run → --apply → deploy code → --apply again (catches
 * anything saved/submitted between the first run and the deploy).
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
  const [{ exists: tabsTableExists }] = await sql`SELECT to_regclass('public.checklist_tabs') IS NOT NULL AS exists`;
  const tabColumns = await sql`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'checklist_submissions' AND column_name IN ('tab_id', 'tab_name')
  `;
  const hasTabId = tabColumns.some((c) => c.column_name === "tab_id");

  const [{ count: templates }] = await sql`SELECT COUNT(*)::int AS count FROM checklist_templates`;
  const [{ count: templatesWithItems }] = await sql`
    SELECT COUNT(*)::int AS count FROM checklist_templates WHERE jsonb_array_length(sections_json) > 0
  `;
  const [{ count: submissions }] = await sql`SELECT COUNT(*)::int AS count FROM checklist_submissions`;
  const [{ count: orphanSubmissions }] = await sql`
    SELECT COUNT(*)::int AS count FROM checklist_submissions s
    WHERE NOT EXISTS (SELECT 1 FROM checklist_templates t WHERE t.account_id = s.account_id)
  `;

  let templatesWithoutTab = templates;
  let tabRows = 0;
  if (tabsTableExists) {
    [{ count: templatesWithoutTab }] = await sql`
      SELECT COUNT(*)::int AS count FROM checklist_templates t
      WHERE NOT EXISTS (SELECT 1 FROM checklist_tabs c WHERE c.account_id = t.account_id)
    `;
    [{ count: tabRows }] = await sql`SELECT COUNT(*)::int AS count FROM checklist_tabs`;
  }

  let unlinkedSubmissions = submissions;
  if (hasTabId) {
    [{ count: unlinkedSubmissions }] = await sql`
      SELECT COUNT(*)::int AS count FROM checklist_submissions WHERE tab_id IS NULL
    `;
  }

  console.log(`checklist_tabs table exists:            ${tabsTableExists}`);
  console.log(`submissions.tab_id / tab_name exist:    ${tabColumns.length === 2}`);
  console.log(`checklist_templates rows:               ${templates} (${templatesWithItems} with items)`);
  console.log(`checklist_tabs rows:                    ${tabRows}`);
  console.log(`templates that would get a "Checklist" tab: ${templatesWithoutTab}`);
  console.log(`checklist_submissions rows:             ${submissions}`);
  console.log(`submissions that would be linked:       ${unlinkedSubmissions - orphanSubmissions}`);
  console.log(`submissions with no template (stay unlinked, still readable): ${orphanSubmissions}`);
}

async function apply(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS checklist_tabs (
      id            SERIAL PRIMARY KEY,
      account_id    TEXT NOT NULL REFERENCES checklist_templates(account_id),
      name          TEXT NOT NULL,
      position      INT  NOT NULL DEFAULT 0,
      sections_json JSONB NOT NULL DEFAULT '[]',
      deleted_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_checklist_tabs_account ON checklist_tabs(account_id) WHERE deleted_at IS NULL`;
  console.log("checklist_tabs ready.");

  await sql`ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS tab_id INT REFERENCES checklist_tabs(id)`;
  await sql`ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS tab_name TEXT`;
  await sql`CREATE INDEX IF NOT EXISTS idx_submissions_tab ON checklist_submissions(tab_id)`;
  console.log("checklist_submissions tab columns ready.");

  const inserted = await sql`
    INSERT INTO checklist_tabs (account_id, name, position, sections_json)
    SELECT t.account_id, 'Checklist', 0, t.sections_json
    FROM checklist_templates t
    WHERE NOT EXISTS (SELECT 1 FROM checklist_tabs c WHERE c.account_id = t.account_id)
    RETURNING id
  `;
  console.log(`Created ${inserted.length} "Checklist" tab(s).`);

  const linked = await sql`
    UPDATE checklist_submissions s
    SET tab_id = c.id, tab_name = c.name
    FROM checklist_tabs c
    WHERE s.tab_id IS NULL
      AND c.id = (SELECT MIN(id) FROM checklist_tabs WHERE account_id = s.account_id)
    RETURNING s.id
  `;
  console.log(`Linked ${linked.length} submission(s) to their account's first tab.`);
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

  await apply(sql);
  console.log("-- after --");
  await report(sql);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
