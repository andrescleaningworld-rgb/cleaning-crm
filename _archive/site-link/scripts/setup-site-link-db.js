#!/usr/bin/env node
/**
 * One-time setup script: creates the tables for the Site Supply Link
 * feature (no-login tokenized page for a sub's employee to order supplies
 * and report site issues) in the Neon Postgres database (DATABASE_URL).
 * Safe to re-run — every statement is CREATE ... IF NOT EXISTS.
 *
 * Usage:
 *   node scripts/setup-site-link-db.js
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

  // account_id/sub_id are the Sheets-side slug ids (e.g. "adam-hall-north-
  // america") — plain TEXT, not a foreign key, since accounts/subs live in
  // Google Sheets, not this database. Never joined against a Sheets read in
  // any public-facing query (see lib/siteLinkDb.ts) — only used server-side
  // to resolve the real account name for admin views and email notifications.
  await sql`
    CREATE TABLE IF NOT EXISTS site_links (
      id SERIAL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      account_id TEXT NOT NULL,
      sub_id TEXT,
      label TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ
    )
  `;
  console.log("site_links ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS supply_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'unit',
      sort_order INT NOT NULL DEFAULT 0,
      active BOOLEAN NOT NULL DEFAULT true
    )
  `;
  console.log("supply_items ready.");

  // Optional per-site allow-list — absence of any row for a given link_id
  // means "every active supply_items row is allowed" (see
  // listSupplyItemsForLink in lib/siteLinkDb.ts), so adding this table
  // doesn't require backfilling one row per existing item/link.
  await sql`
    CREATE TABLE IF NOT EXISTS site_link_items (
      link_id INT NOT NULL REFERENCES site_links(id) ON DELETE CASCADE,
      item_id INT NOT NULL REFERENCES supply_items(id) ON DELETE CASCADE,
      PRIMARY KEY (link_id, item_id)
    )
  `;
  console.log("site_link_items ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS supply_orders (
      id SERIAL PRIMARY KEY,
      link_id INT NOT NULL REFERENCES site_links(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'new',
      note TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("supply_orders ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS supply_order_lines (
      id SERIAL PRIMARY KEY,
      order_id INT NOT NULL REFERENCES supply_orders(id) ON DELETE CASCADE,
      item_id INT NOT NULL REFERENCES supply_items(id),
      qty INT NOT NULL CHECK (qty > 0)
    )
  `;
  console.log("supply_order_lines ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS site_issues (
      id SERIAL PRIMARY KEY,
      link_id INT NOT NULL REFERENCES site_links(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at TIMESTAMPTZ
    )
  `;
  console.log("site_issues ready.");

  await sql`
    CREATE TABLE IF NOT EXISTS site_issue_photos (
      id SERIAL PRIMARY KEY,
      issue_id INT NOT NULL REFERENCES site_issues(id) ON DELETE CASCADE,
      blob_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;
  console.log("site_issue_photos ready.");

  await sql`CREATE INDEX IF NOT EXISTS idx_site_links_account ON site_links(account_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supply_orders_link ON supply_orders(link_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supply_orders_created_at ON supply_orders(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_supply_order_lines_order ON supply_order_lines(order_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_site_issues_link ON site_issues(link_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_site_issues_created_at ON site_issues(created_at DESC)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_site_issue_photos_issue ON site_issue_photos(issue_id)`;
  console.log("Indexes ready.");

  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
