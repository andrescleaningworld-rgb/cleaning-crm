// Applies db/migrations/NNN_<name>.sql to the PRODUCTION database, in order,
// the same way apply.mjs does for the practice database: each file in one
// transaction together with its schema_migrations row, never twice, and it
// stops if a file was edited after it was applied.
//
//   npx tsx scripts/migrate/apply-production.mts            list applied / pending; change nothing
//   npx tsx scripts/migrate/apply-production.mts --apply    apply what is pending
//
// Take a Neon backup branch first. The address comes from
// .env.production.local (lib/production.mjs); it is never printed.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { REPO_ROOT } from "./lib/env.mjs";
import { productionUrl } from "./lib/production.mjs";

const apply = process.argv.includes("--apply");
const sql = neon(productionUrl());
const MIGRATIONS_DIR = path.join(REPO_ROOT, "db", "migrations");

/** Splits a file into statements on ";" at end of line; text between $$ markers is kept whole. (Same as apply.mjs.) */
function splitStatements(text: string): string[] {
  const statements: string[] = [];
  let current: string[] = [];
  let inDollar = false;
  for (const line of text.split(/\r?\n/)) {
    current.push(line);
    const markers = (line.match(/\$\$/g) ?? []).length;
    if (markers % 2 === 1) inDollar = !inDollar;
    if (!inDollar && /;\s*(--.*)?$/.test(line)) {
      statements.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length) statements.push(current.join("\n"));
  return statements.map((s) => s.trim()).filter((s) => s.split("\n").some((l) => l.trim() && !l.trim().startsWith("--")));
}

console.log(`PRODUCTION database. ${apply ? "Applying what is pending." : "Status only: nothing is changed."}`);
const has = (await sql`SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok`) as { ok: boolean }[];
if (!has[0].ok) {
  if (!apply) console.log("There is no schema_migrations table yet: every file below is pending.");
  else await sql`CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`;
}
const rows = has[0].ok || apply ? ((await sql`SELECT filename, checksum FROM schema_migrations`) as { filename: string; checksum: string }[]) : [];
const applied = new Map(rows.map((row) => [row.filename, row.checksum]));
const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
for (const [filename] of applied) if (!files.includes(filename)) console.log(`note     ${filename} is recorded as applied but is not a file here any more (renamed).`);

let failed = false;
for (const filename of files) {
  const text = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8").replace(/\r\n/g, "\n");
  const checksum = crypto.createHash("sha256").update(text).digest("hex");
  if (applied.has(filename)) {
    if (applied.get(filename) !== checksum) {
      console.error(`CHANGED  ${filename} – edited after it was applied. Stopping.`);
      failed = true;
      break;
    }
    console.log(`applied  ${filename}`);
    continue;
  }
  if (!apply) {
    console.log(`pending  ${filename}`);
    continue;
  }
  const statements = splitStatements(text);
  await sql.transaction([...statements.map((statement) => sql.query(statement)), sql`INSERT INTO schema_migrations (filename, checksum) VALUES (${filename}, ${checksum})`]);
  console.log(`APPLIED  ${filename} (${statements.length} statements)`);
}
process.exitCode = failed ? 1 : 0;
