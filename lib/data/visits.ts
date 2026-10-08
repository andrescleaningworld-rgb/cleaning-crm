// Visits (the Visits tab and VisitEditLog). Routes import from here;
// DATA_SOURCE_VISITS decides whether a call goes to Google Sheets (default,
// today's behavior) or to Postgres. Function names and return shapes are
// identical on both sides.
//
// The visit list and "add visit" are Apps Script actions today
// (app/api/visits/route.ts). With DATA_SOURCE_VISITS=postgres that route
// uses getVisitsAppsScriptShape / addVisit from lib/pg/visits.ts instead;
// visitsOnPostgres() is the one switch point for it.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/visits";

export type { CustomerVisit, ManagerVisit, ManagerVisitUpdateInput, VisitEditLogEntry, VisitEditLogInput } from "@/lib/googleSheets";
export type { AddVisitInput, AppsScriptVisit } from "@/lib/pg/visits";

export const visitsOnPostgres = () => isPostgres("VISITS");
const source = () => (visitsOnPostgres() ? pg : sheets);

export const getManagerVisitById: typeof sheets.getManagerVisitById = (...args) => source().getManagerVisitById(...args);
export const updateManagerVisit: typeof sheets.updateManagerVisit = (...args) => source().updateManagerVisit(...args);
export const fetchVisitEditLog: typeof sheets.fetchVisitEditLog = (...args) => source().fetchVisitEditLog(...args);
export const appendVisitEditLog: typeof sheets.appendVisitEditLog = (...args) => source().appendVisitEditLog(...args);
export const getVisitsByAccountName: typeof sheets.getVisitsByAccountName = (...args) => source().getVisitsByAccountName(...args);

// Postgres only: the Apps Script getVisits / addVisit replacements.
export const getVisitsAppsScriptShape = pg.getVisitsAppsScriptShape;
export const addVisit = pg.addVisit;
