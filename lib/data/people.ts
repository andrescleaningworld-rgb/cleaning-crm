// People: Staff (login identities, equipment sign-off) and Managers
// (account owners, To-Do assignees). DATA_SOURCE_PEOPLE decides whether a
// call goes to Google Sheets (default, today's behavior) or to Postgres.
// Function names and return shapes are identical on both sides.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/people";

export type { Manager, Staff, StaffRole } from "@/lib/googleSheets";

const source = () => (isPostgres("PEOPLE") ? pg : sheets);

export const fetchManagers: typeof sheets.fetchManagers = () => source().fetchManagers();
export const getManagerCalendarColorId: typeof sheets.getManagerCalendarColorId = (...args) =>
  source().getManagerCalendarColorId(...args);
export const appendManager: typeof sheets.appendManager = (...args) => source().appendManager(...args);
export const updateManager: typeof sheets.updateManager = (...args) => source().updateManager(...args);

export const fetchStaff: typeof sheets.fetchStaff = () => source().fetchStaff();
export const getStaffById: typeof sheets.getStaffById = (...args) => source().getStaffById(...args);
export const getActiveSigningStaffById: typeof sheets.getActiveSigningStaffById = (...args) =>
  source().getActiveSigningStaffById(...args);
export const appendStaff: typeof sheets.appendStaff = (...args) => source().appendStaff(...args);
export const updateStaff: typeof sheets.updateStaff = (...args) => source().updateStaff(...args);
export const deleteStaff: typeof sheets.deleteStaff = (...args) => source().deleteStaff(...args);

// Equipment sign-off history lives in the EquipmentCheckouts tab, which
// belongs to the Equipment area: DATA_SOURCE_EQUIPMENT decides where this
// looks, whichever source People is on.
export { staffHasEquipmentCheckoutHistory } from "@/lib/data/equipment";
