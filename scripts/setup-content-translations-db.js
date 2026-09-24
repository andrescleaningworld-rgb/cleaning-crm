#!/usr/bin/env node
/**
 * Crew languages (EN / ES / PT): translations of crew-facing CONTENT
 * (checklist tabs/sections/items, Team Hub library items and rounds, supply
 * items) — see lib/crewTranslations.ts. One row per (English text, language):
 *   source_text  the English text, normalized (trimmed, inner whitespace
 *                collapsed — lib/translationKey.ts)
 *   lang         'es' or 'pt'
 *   auto_text    automatic translation (Claude Haiku via lib/translate.ts)
 *   manual_text  a manager's correction; always wins over auto_text
 * New table only; nothing existing changes. Safe to re-run.
 *
 * Usage:
 *   node scripts/setup-content-translations-db.js           # read-only dry run (default)
 *   node scripts/setup-content-translations-db.js --apply   # create the table
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
  const [{ exists }] = await sql`SELECT to_regclass('public.content_translations') IS NOT NULL AS exists`;
  console.log(`content_translations exists: ${exists}`);
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

  await sql`
    CREATE TABLE IF NOT EXISTS content_translations (
      source_text TEXT NOT NULL,
      lang TEXT NOT NULL CHECK (lang IN ('es', 'pt')),
      auto_text TEXT,
      manual_text TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (source_text, lang)
    )
  `;
  console.log("-- after --");
  await report(sql);
  console.log("Done.");
}

main().catch((err) => {
  console.error("Setup script failed:", err);
  process.exit(1);
});
