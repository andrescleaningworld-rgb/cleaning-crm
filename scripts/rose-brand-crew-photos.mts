/**
 * One-time fix (safe to run again): Rose Brand's photos into the customer
 * portal, which shows only "Crew" photos kept in Blob storage.
 *
 *   A. The 22 Photos-page uploads of Oct 29 2026, labeled "Sub photo"
 *      -> relabeled "Crew" (they are already in Blob).
 *   B. The Drive imports labeled "Crew problem" (274 on Oct 29) -> each
 *      photo copied from Drive into Blob (2400px + 400px small copy,
 *      lib/photoImport.ts copyDrivePhotoToBlob), and its row changed to
 *      kind "Crew", store "blob", the new addresses. The taken date, the
 *      Drive file id (source_key) and everything else stay. Drive is only
 *      read; nothing there changes.
 *
 * Runs on PRODUCTION (DATABASE_URL of .env.local, endpoint checked; the
 * Google service account comes from .env.development.local).
 *   npx tsx --env-file=.env.local --env-file=.env.development.local scripts/rose-brand-crew-photos.mts           # dry run: counts only, no writes
 *   npx tsx --env-file=.env.local --env-file=.env.development.local scripts/rose-brand-crew-photos.mts --apply   # make the changes
 *
 * The dry run reads every Drive file's type and makes ONE test copy in
 * memory (nothing saved). A second --apply only does what is left.
 */
import { neon } from "@neondatabase/serverless";
import { PRODUCTION_ENDPOINTS } from "@/lib/db";
import { COPYABLE_TYPES, copyDrivePhotoToBlob, DriveCopyError, driveFileInfo, makeCrewCopies } from "@/lib/photoImport";

const ACCOUNT = "rose-brand";
const UPLOAD_DAY = "2026-10-29"; // office day the 22 uploads were added
const apply = process.argv.includes("--apply");

const url = process.env.DATABASE_URL ?? "";
const endpoint = url ? new URL(url).host.split(".")[0].replace(/-pooler$/, "") : "";
if (!PRODUCTION_ENDPOINTS.includes(endpoint)) {
  console.error("DATABASE_URL is not the production database. Nothing was done.");
  process.exit(1);
}
if (!process.env.BLOB_READ_WRITE_TOKEN || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
  console.error("BLOB_READ_WRITE_TOKEN or the Google service account is missing. Nothing was done.");
  process.exit(1);
}
const sql = neon(url);
console.log(apply ? "== APPLY on PRODUCTION ==" : "== DRY RUN on PRODUCTION (read only) — pass --apply to make the changes ==");

type Row = { id: string; source_key: string; kind: string; store: string; thumb_url: string; hidden_from_customer: boolean };

/* ---------- A. the 22 uploads ---------- */
const uploads = (await sql`
  SELECT id, source_key, kind, store, thumb_url, hidden_from_customer FROM photo_index
  WHERE account_id = ${ACCOUNT} AND kind = 'Sub photo' AND store = 'blob' AND source_key LIKE 'manual:%'
    AND (indexed_at AT TIME ZONE 'America/New_York')::date = ${UPLOAD_DAY}::date
  ORDER BY id
`) as Row[];
console.log(`\nA. Photos-page uploads (${UPLOAD_DAY}) labeled "Sub photo", in Blob: ${uploads.length}`);
console.log(`   hidden from customer: ${uploads.filter((r) => r.hidden_from_customer).length}`);

/* ---------- B. the Drive imports ---------- */
const drive = (await sql`
  SELECT id, source_key, kind, store, thumb_url, hidden_from_customer FROM photo_index
  WHERE account_id = ${ACCOUNT} AND kind = 'Crew problem' AND store = 'drive' AND source_key LIKE 'drive-import:%'
  ORDER BY taken_at, id
`) as Row[];
const doneBefore = (await sql`
  SELECT count(*)::int AS n FROM photo_index WHERE account_id = ${ACCOUNT} AND kind = 'Crew' AND store = 'blob' AND source_key LIKE 'drive-import:%'
`) as { n: number }[];
console.log(`\nB. Drive imports labeled "Crew problem", still in Drive: ${drive.length}`);
console.log(`   already copied by an earlier run: ${doneBefore[0].n}`);

const fileId = (row: Row) => row.source_key.slice("drive-import:".length);
const types = new Map<string, number>();
let unseen = 0;
let bytes = 0;
const copyable: Row[] = [];
for (const [i, row] of drive.entries()) {
  if (i % 50 === 0 && i > 0) console.log(`   …checked ${i} of ${drive.length} in Drive`);
  const info = await driveFileInfo(fileId(row));
  if (!info) {
    unseen++;
    continue;
  }
  types.set(info.mimeType, (types.get(info.mimeType) ?? 0) + 1);
  bytes += info.bytes;
  if (COPYABLE_TYPES.includes(info.mimeType.toLowerCase())) copyable.push(row);
}
console.log(`   the app can open in Drive: ${drive.length - unseen}   cannot open: ${unseen}`);
console.log(`   file types: ${[...types.entries()].map(([type, n]) => `${type} ${n}`).join(", ") || "—"}`);
console.log(`   can be copied: ${copyable.length}   size in Drive: ${(bytes / 1024 / 1024).toFixed(0)} MB`);

if (copyable[0]) {
  try {
    const test = await makeCrewCopies(fileId(copyable[0]));
    console.log(`   test copy of 1 photo (in memory, not saved): ${(test.originalBytes / 1024).toFixed(0)} KB -> ${(test.full.length / 1024).toFixed(0)} KB + small ${(test.thumb.length / 1024).toFixed(0)} KB`);
  } catch (error) {
    console.log(`   test copy FAILED: ${error instanceof Error ? error.message : error}`);
  }
}

const portalNow = (await sql`SELECT count(*)::int AS n FROM photo_index WHERE kind = 'Crew' AND account_id = ${ACCOUNT} AND NOT hidden_from_customer AND store = 'blob'`) as { n: number }[];
const after = portalNow[0].n + uploads.filter((r) => !r.hidden_from_customer).length + copyable.filter((r) => !r.hidden_from_customer).length;
console.log(`\nRose Brand customer portal photos: now ${portalNow[0].n}, after the fix ${after}`);

if (!apply) {
  console.log("\nDry run: nothing was written.");
  process.exit(0);
}

/* ---------- apply ---------- */
const ids = uploads.map((r) => r.id);
const relabeled = ids.length
  ? ((await sql`UPDATE photo_index SET kind = 'Crew' WHERE id = ANY(${ids}) AND kind = 'Sub photo' AND account_id = ${ACCOUNT} RETURNING id`) as unknown[]).length
  : 0;
console.log(`\nA. relabeled "Crew": ${relabeled}`);

let copied = 0;
const failed: string[] = [];
const queue = [...copyable];
async function worker() {
  for (let row = queue.shift(); row; row = queue.shift()) {
    try {
      const copy = await copyDrivePhotoToBlob(fileId(row), ACCOUNT);
      const done = (await sql`
        UPDATE photo_index SET kind = 'Crew', store = 'blob', url = ${copy.url}, thumb_url = ${copy.thumbUrl}
        WHERE id = ${row.id} AND store = 'drive' AND account_id = ${ACCOUNT}
        RETURNING id
      `) as unknown[];
      if (done.length) copied++;
      if (copied % 25 === 0 && done.length) console.log(`   …${copied} copied`);
    } catch (error) {
      failed.push(`${row.id} (${fileId(row)}): ${error instanceof DriveCopyError ? error.message : error instanceof Error ? error.message : String(error)}`);
    }
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);
console.log(`B. copied into Blob and relabeled "Crew": ${copied}   failed: ${failed.length}`);
for (const line of failed) console.log(`   ${line}`);
if (failed.length) console.log("   Run --apply again to retry the ones that failed (the rest are skipped).");
