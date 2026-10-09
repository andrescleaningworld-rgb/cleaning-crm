// Reads compared by `npx tsx scripts/migrate/parity.mts visits`.
// The visit list itself is an Apps Script action on the Sheets side; it is
// compared by scripts/migrate/check-visits-apps-script.mts.
import type { ParityRead } from "../parity.mts";
import { readTab } from "../lib/sheets-readonly.mjs";
import { fetchVisitEditLog, getManagerVisitById, getVisitsByAccountName } from "../../../lib/data/visits";

export const AREA = "VISITS";

// Every by-id read on the Sheets side fetches the whole tab, so the list is
// kept short (the Sheets API allows 60 reads a minute).
// The same visit ids on both sides, read once from the sheet: the first,
// the last, one in the middle, every visit that has an edit-log line, and
// the first row whose date is not ISO ("3/26/24").
const rows = (await readTab("MAIN", "Visits", { range: "A:M" })).slice(1).filter((r) => String(r[0] ?? "").trim() && String(r[1] ?? "").trim());
const ids = rows.map((r) => String(r[0]).trim());
const slashDate = rows.find((r) => String(r[3] ?? "").includes("/"));
const logIds = [...new Set((await readTab("MAIN", "VisitEditLog", { range: "A:E" })).slice(1).map((r) => String(r[1] ?? "").trim()).filter(Boolean))];
const sample = [...new Set([ids[0], ids[Math.floor(ids.length / 2)], ids[ids.length - 1], slashDate ? String(slashDate[0]).trim() : "", ...logIds].filter(Boolean))];
// For the customer-portal read: an account name, and (because that read
// compares the name with column B) a real column-B value.
const firstName = String(rows[0]?.[2] ?? "");
const firstColumnB = String(rows[0]?.[1] ?? "");

export const reads: ParityRead[] = [
  ...sample.map((id, i) => ({ name: `getManagerVisitById(sample ${i + 1})`, run: () => getManagerVisitById(id) })),
  { name: "getManagerVisitById(missing)", run: () => getManagerVisitById("VISIT-does-not-exist") },
  { name: "getManagerVisitById(blank)", run: () => getManagerVisitById("  ") },
  ...logIds.map((id, i) => ({ name: `fetchVisitEditLog(visit ${i + 1} with edits)`, run: () => fetchVisitEditLog(id) })),
  { name: "fetchVisitEditLog(visit without edits)", run: () => fetchVisitEditLog(ids[0]) },
  { name: "getVisitsByAccountName(an account name)", run: () => getVisitsByAccountName(firstName) },
  { name: "getVisitsByAccountName(a column-B value)", run: () => getVisitsByAccountName(firstColumnB) },
  { name: "getVisitsByAccountName(nobody)", run: () => getVisitsByAccountName("No Such Account") },
];
