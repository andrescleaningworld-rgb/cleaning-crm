// Scheduling (SubSchedules, ScheduleExceptions, subcontractor-visits).
// Routes import from here; DATA_SOURCE_SCHEDULING decides whether a call goes
// to Google Sheets (default, today's behavior) or to Postgres. Function names
// and return shapes are identical on both sides.
//
// The customer-facing Visits tab (getVisitsByAccountName) is not here: it
// belongs to the Visits area.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/scheduling";

export type { ScheduleException, SubcontractorVisit, SubcontractorVisitWithRow, SubSchedule } from "@/lib/googleSheets";

const source = () => (isPostgres("SCHEDULING") ? pg : sheets);

export const getAllSubcontractorVisits: typeof sheets.getAllSubcontractorVisits = () => source().getAllSubcontractorVisits();
export const getSubcontractorVisits: typeof sheets.getSubcontractorVisits = (...args) => source().getSubcontractorVisits(...args);
export const updateSubcontractorVisit: typeof sheets.updateSubcontractorVisit = (...args) => source().updateSubcontractorVisit(...args);
export const deleteSubcontractorVisit: typeof sheets.deleteSubcontractorVisit = (...args) => source().deleteSubcontractorVisit(...args);
export const logSubcontractorVisit: typeof sheets.logSubcontractorVisit = (...args) => source().logSubcontractorVisit(...args);

export const fetchSubSchedules: typeof sheets.fetchSubSchedules = () => source().fetchSubSchedules();
export const appendSubSchedule: typeof sheets.appendSubSchedule = (...args) => source().appendSubSchedule(...args);
export const updateSubSchedule: typeof sheets.updateSubSchedule = (...args) => source().updateSubSchedule(...args);
export const applySchedulePatternChange: typeof sheets.applySchedulePatternChange = (...args) =>
  source().applySchedulePatternChange(...args);
export const supersedeActiveSubSchedulesForSub: typeof sheets.supersedeActiveSubSchedulesForSub = (...args) =>
  source().supersedeActiveSubSchedulesForSub(...args);

export const fetchScheduleExceptions: typeof sheets.fetchScheduleExceptions = () => source().fetchScheduleExceptions();
export const appendScheduleException: typeof sheets.appendScheduleException = (...args) => source().appendScheduleException(...args);
export const updateScheduleException: typeof sheets.updateScheduleException = (...args) => source().updateScheduleException(...args);
export const deleteScheduleException: typeof sheets.deleteScheduleException = (...args) => source().deleteScheduleException(...args);
