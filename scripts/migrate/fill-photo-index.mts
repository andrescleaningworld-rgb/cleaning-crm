// Fills the photo index from every place the app keeps photos, in the
// practice database only. Read-only on Google Sheets and Apps Script (it asks
// Apps Script for the Photos list with "getPhotos"; it writes nothing there).
// It only adds index rows: no file and no source row is moved or changed.
// Safe to run again: a photo already in the index is skipped.
//
//   npx tsx scripts/migrate/fill-photo-index.mts
//
// (The Photos page does the same thing by itself each time it is opened;
// this script is for filling the index once up front and seeing the counts.)
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";

const { getSql } = await import("../../lib/db");
const { syncPhotoIndex } = await import("../../lib/pg/photo-index");
const sql = getSql();

const before = ((await sql`SELECT count(*)::int AS n FROM photo_index`) as { n: number }[])[0].n;
const report = await syncPhotoIndex(true);
for (const line of report) console.log(`${line.ok ? "ok     " : "skipped"}  ${line.source}`);
const rows = (await sql`SELECT kind, store, count(*)::int AS n FROM photo_index GROUP BY kind, store ORDER BY kind, store`) as { kind: string; store: string; n: number }[];
const after = rows.reduce((sum, row) => sum + row.n, 0);
console.log(`\nPhotos in the index: ${after} (${after - before} added now)`);
for (const row of rows) console.log(`  ${row.kind} (${row.store}): ${row.n}`);
