// Subcontractors and the Subcontractor Activity Log (the Sub Center log —
// never the staff audit log). DATA_SOURCE_SUBS decides whether a call goes
// to Google Sheets (default, today's behavior) or to Postgres.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/subs";
import * as pgPerformance from "@/lib/pg/performance";

export type { RawSubcontractorRow, SubcontractorActivityLogEntry } from "@/lib/googleSheets";

const source = () => (isPostgres("SUBS") ? pg : sheets);

export const getAllSubcontractorsRaw: typeof sheets.getAllSubcontractorsRaw = () => source().getAllSubcontractorsRaw();
export const updateSubcontractor: typeof sheets.updateSubcontractor = (...args) => source().updateSubcontractor(...args);

// Portal activity is written by the Apps Script backend (login, "viewed
// schedule", …) until the Sub portal area (13) moves it. Reading the log
// from Postgres before then would hide everything new, so the log follows
// Postgres only when BOTH switches are on.
export const getSubcontractorActivityLog: typeof sheets.getSubcontractorActivityLog = () =>
  isPostgres("SUBS") && isPostgres("SUB_PORTAL") ? pg.getSubcontractorActivityLog() : sheets.getSubcontractorActivityLog();

// The performance score is worked out from four lists at once: accounts,
// visits, complaints and subcontractors. It reads Postgres only when all
// four of those switches are on; until then it reads the four tabs, as today.
export const getSubcontractorPerformanceMap: typeof sheets.getSubcontractorPerformanceMap = () =>
  isPostgres("SUBS") && isPostgres("ACCOUNTS") && isPostgres("VISITS") && isPostgres("COMPLAINTS")
    ? pgPerformance.getSubcontractorPerformanceMap()
    : sheets.getSubcontractorPerformanceMap();

/** True when adding a subcontractor is handled here instead of by Apps Script. */
export const subsOnPostgres = () => isPostgres("SUBS");

// Only exists on the Postgres side: with Sheets, the route still forwards
// "addSubcontractor" to the Apps Script backend, as it always has.
export const addSubcontractor = pg.addSubcontractor;

// The list Apps Script's "getSubcontractors" returns, rebuilt from Postgres
// (see lib/pg/subs.ts for the mapping). Callers use it only when
// subsOnPostgres(); otherwise they keep calling Apps Script as before.
export const getSubcontractorsAppsScriptShape = pg.getSubcontractorsAppsScriptShape;
