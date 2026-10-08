// Complaints (the Complaints tab). Routes import from here;
// DATA_SOURCE_COMPLAINTS decides whether a call goes to Google Sheets /
// Apps Script (default, today's behavior) or to Postgres.
//
// Only creating a complaint is a direct Sheets write today; the list,
// closing and resending are Apps Script actions (app/api/complaints/route.ts).
// With DATA_SOURCE_COMPLAINTS=postgres that route uses the functions below
// instead; complaintsOnPostgres() is the one switch point for it.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/complaints";

export type { ComplaintInput } from "@/lib/googleSheets";
export type { AppsScriptComplaint, CloseComplaintInput, ComplaintForResend } from "@/lib/pg/complaints";

export const complaintsOnPostgres = () => isPostgres("COMPLAINTS");

export const appendComplaint: typeof sheets.appendComplaint = (...args) =>
  (complaintsOnPostgres() ? pg : sheets).appendComplaint(...args);

// Postgres only: the Apps Script getComplaints / closeComplaint /
// resendComplaintNotification replacements.
export const getComplaintsAppsScriptShape = pg.getComplaintsAppsScriptShape;
export const closeComplaint = pg.closeComplaint;
export const getComplaintForResend = pg.getComplaintForResend;
