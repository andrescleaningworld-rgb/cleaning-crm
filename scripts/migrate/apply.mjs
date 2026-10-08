// Applies db/migrations/NNN_<name>.sql to the Neon dev branch, in order.
//
//   node scripts/migrate/apply.mjs            apply everything not yet applied
//   node scripts/migrate/apply.mjs --status   list applied / pending, change nothing
//
// Each file runs in one transaction together with its schema_migrations row,
// so a file is either fully applied or not at all. Files are never edited
// after applying: a changed checksum stops the run.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./lib/env.mjs";
import { getSql } from "./lib/pg.mjs";

const MIGRATIONS_DIR = path.join(REPO_ROOT, "db", "migrations");
const statusOnly = process.argv.includes("--status");

/**
 * Splits a file into statements on ";" at end of line. Text between a pair of
 * $$ markers (function bodies, DO blocks) is kept whole.
 */
export function splitStatements(text) {
  const statements = [];
  let current = [];
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
  return statements
    .map((s) => s.trim())
    .filter((s) => s.split("\n").some((l) => l.trim() && !l.trim().startsWith("--")));
}

const sql = getSql();

await sql`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    checksum   TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

const applied = new Map((await sql`SELECT filename, checksum FROM schema_migrations`).map((r) => [r.filename, r.checksum]));
const files = fs.existsSync(MIGRATIONS_DIR)
  ? fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort()
  : [];

let failed = false;
for (const filename of files) {
  const text = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8").replace(/\r\n/g, "\n");
  const checksum = crypto.createHash("sha256").update(text).digest("hex");

  if (applied.has(filename)) {
    if (applied.get(filename) !== checksum) {
      console.error(`CHANGED  ${filename} – edited after it was applied. Put the change in a new migration file.`);
      failed = true;
    } else {
      console.log(`applied  ${filename}`);
    }
    continue;
  }
  if (failed) break;
  if (statusOnly) {
    console.log(`pending  ${filename}`);
    continue;
  }

  const statements = splitStatements(text);
  await sql.transaction([
    ...statements.map((statement) => sql.query(statement)),
    sql`INSERT INTO schema_migrations (filename, checksum) VALUES (${filename}, ${checksum})`,
  ]);
  console.log(`APPLIED  ${filename} (${statements.length} statements)`);
}

// Not process.exit(): on Windows it can abort while fetch sockets are closing.
process.exitCode = failed ? 1 : 0;
