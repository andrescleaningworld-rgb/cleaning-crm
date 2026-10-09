// Exercises every Postgres write in lib/pg/catalogs.ts against the dev
// branch, checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-catalogs-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_CATALOGS = "postgres";

const data = await import("../../lib/data/catalogs");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};
const throwsWith = async (run: () => Promise<unknown>, text: string) => {
  try {
    await run();
    return false;
  } catch (e) {
    return e instanceof Error && e.message.includes(text);
  }
};

const MARK = "__migration-write-test__";
const before = {
  services: (await data.fetchExtraServices()).length,
  documents: (await data.fetchDocuments()).length,
  sends: (await data.fetchDocumentSends()).length,
};

try {
  // ExtraServices: create, partial update, soft delete.
  const svcId = await data.appendExtraService({ name: MARK, description: "d", imageUrl: "", active: true, sortOrder: 7 });
  check("appendExtraService returns an SVC- id", /^SVC-[\d-]{8}-[a-z0-9]{1,4}$/.test(svcId), svcId);
  const list = await data.fetchExtraServices();
  check("new service is last in the list (where Sheets would append it)", list[list.length - 1]?.id === svcId);
  await data.updateExtraService(svcId, { name: `${MARK} 2` });
  let svc = await data.getExtraServiceById(svcId);
  check("partial update changes only the sent field", svc?.name === `${MARK} 2` && svc.description === "d" && svc.sortOrder === 7 && svc.active === true);
  await data.updateExtraService(svcId, { active: false });
  svc = await data.getExtraServiceById(svcId);
  check("soft delete keeps the row, active = false", svc?.active === false && svc.name === `${MARK} 2`);
  await data.updateExtraService(svcId, {});
  check("update with no fields is a no-op", (await data.getExtraServiceById(svcId))?.name === `${MARK} 2`);
  check("update of a missing id says not found", await throwsWith(() => data.updateExtraService("SVC-nope", { name: "x" }), 'Extra service "SVC-nope" not found.'));
  check("update with a blank id is refused", await throwsWith(() => data.updateExtraService("  ", { name: "x" }), "Missing extra service id."));

  // Documents: create, read, send log, hard delete.
  const docId = await data.appendDocument({ name: MARK, category: "Other", fileName: "t.pdf", fileUrl: "https://example.invalid/t.pdf", fileSize: 1234, uploadedBy: "test" });
  const doc = await data.getDocumentById(docId);
  check("appendDocument stores every field", doc?.name === MARK && doc.category === "Other" && doc.fileSize === 1234 && doc.uploadedBy === "test" && /^\d{4}-\d\d-\d\dT.*Z$/.test(doc.uploadedAt), docId);

  const sendId = await data.appendDocumentSend({ documentId: docId, documentName: MARK, subcontractorId: "SUB-ROW-0", subcontractorName: MARK, sentBy: "test", note: "n" });
  const sends = await data.fetchDocumentSends(docId);
  check("appendDocumentSend shows up for its document", sends.length === 1 && sends[0].id === sendId && sends[0].subcontractorId === "SUB-ROW-0" && sends[0].note === "n");
  check("newest send is first in the full list", (await data.fetchDocumentSends())[0]?.id === sendId);

  await data.deleteDocument(docId);
  check("deleteDocument removes the document", (await data.getDocumentById(docId)) === null);
  check("send history stays after the document is deleted", (await data.fetchDocumentSends(docId)).length === 1);
  check("deleting it again says not found", await throwsWith(() => data.deleteDocument(docId), `Document "${docId}" not found.`));

  // GeocodeCache: miss, write, hit, second write keeps the first.
  const address = `${MARK} 1 Test St`;
  check("geocode miss returns null", (await data.getGeocodeCacheEntry(address)) === null);
  await data.appendGeocodeCacheEntry(`  ${address}  `, 40.5, -74.25);
  const hit = await data.getGeocodeCacheEntry(address);
  check("geocode hit returns the numbers", hit?.latitude === 40.5 && hit.longitude === -74.25);
  await data.appendGeocodeCacheEntry(address, 1, 2);
  check("second write keeps the first entry", (await data.getGeocodeCacheEntry(address))?.latitude === 40.5);
} finally {
  // Remove only what this test made: rows created in Postgres carrying MARK.
  await sql`DELETE FROM extra_services WHERE source_sheet IS NULL AND name LIKE ${`${MARK}%`}`;
  await sql`DELETE FROM documents WHERE source_sheet IS NULL AND name = ${MARK}`;
  await sql`DELETE FROM document_sends WHERE source_sheet IS NULL AND document_name = ${MARK}`;
  await sql`DELETE FROM geocode_cache WHERE source_sheet IS NULL AND address LIKE ${`${MARK}%`}`;
}

check(
  "test rows cleaned up",
  (await data.fetchExtraServices()).length === before.services &&
    (await data.fetchDocuments()).length === before.documents &&
    (await data.fetchDocumentSends()).length === before.sends
);
process.exitCode = failed ? 1 : 0;
