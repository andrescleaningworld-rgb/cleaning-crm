// Brings ONLY the photos table up to date with the Photos list Apps Script
// keeps (asked with "getPhotos", read-only). It adds the photos the database
// does not have yet; it never changes one it has, and never deletes. Use it
// right before DATA_SOURCE_PHOTOS is switched to postgres.
//
//   npx tsx scripts/migrate/refresh-photos.mts                        practice database, dry run
//   npx tsx scripts/migrate/refresh-photos.mts --write                practice database, add
//   npx tsx scripts/migrate/refresh-photos.mts --production           production, dry run
//   npx tsx scripts/migrate/refresh-photos.mts --production --write   production, add
//
// No names, notes or links are printed: only counts.
import { neon } from "@neondatabase/serverless";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";
import { productionUrl } from "./lib/production.mjs";

loadEnv();
const write = process.argv.includes("--write");
const production = process.argv.includes("--production");
const sql = neon(production ? productionUrl() : assertDevDatabase(process.env.MIGRATION_DATABASE_URL));
const base = process.env.GOOGLE_SCRIPT_URL;
if (!base) throw new Error("GOOGLE_SCRIPT_URL is not set here.");
console.log(`${production ? "PRODUCTION" : "Practice"} database, ${write ? "writing" : "dry run (nothing is written)"}.`);

const response = await fetch(`${base}?action=getPhotos`, { cache: "no-store" });
const json = (await response.json()) as { success?: boolean; photos?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
const live = json.photos ?? json.data;
if (!response.ok || json.success === false || !Array.isArray(live)) throw new Error("Apps Script did not answer with the photo list.");
const text = (row: Record<string, unknown>, key: string) => String(row[key] ?? "").trim();

const have = new Set(((await sql`SELECT photo_id FROM photos`) as { photo_id: string }[]).map((row) => row.photo_id.trim()));
const fresh = live.filter((row) => text(row, "photoId") && !have.has(text(row, "photoId")));
console.log(`Apps Script: ${live.length} photos. Database: ${have.size}. New to add: ${fresh.length}.`);

if (write) {
  for (const row of fresh) {
    const day = /^\d{4}-\d{2}-\d{2}/.test(text(row, "timestamp")) ? text(row, "timestamp").slice(0, 10) : null;
    await sql`
      INSERT INTO photos (legacy_key, timestamp_raw, taken_on, photo_id, account_id_raw, account_name, account_ref, source_type, source_id, uploaded_by, user_role, file_name, drive_file_id, drive_url, folder_url, notes, status, sheet_row, source_sheet, imported_at)
      SELECT ${text(row, "photoId")}, ${text(row, "timestamp")}, ${day}::date, ${text(row, "photoId")}, ${text(row, "accountId")}, ${text(row, "accountName")},
             (SELECT id FROM accounts WHERE ${text(row, "accountId")} <> '' AND id = ${text(row, "accountId")} LIMIT 1),
             ${text(row, "sourceType")}, ${text(row, "sourceId")}, ${text(row, "uploadedBy")}, ${text(row, "userRole")}, ${text(row, "fileName")}, ${text(row, "driveFileId")}, ${text(row, "driveUrl")}, ${text(row, "folderUrl")},
             ${text(row, "notes")}, ${text(row, "status")}, (SELECT COALESCE(max(sheet_row), 1) + 1 FROM photos), 'MAIN', now()
      ON CONFLICT DO NOTHING
    `;
  }
  const after = ((await sql`SELECT count(*)::int AS n, count(*) FILTER (WHERE blob_url <> '')::int AS blob FROM photos`) as { n: number; blob: number }[])[0];
  const missing = live.filter((row) => text(row, "photoId")).length - ((await sql`SELECT count(*)::int AS n FROM photos WHERE photo_id = ANY(${live.map((row) => text(row, "photoId"))}::text[])`) as { n: number }[])[0].n;
  console.log(`Done. Database now has ${after.n} photos (${after.blob} already copied to Blob). Still missing from Apps Script's list: ${missing}.`);
}
