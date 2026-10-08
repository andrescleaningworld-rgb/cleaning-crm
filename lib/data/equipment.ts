// Equipment (EquipmentCategories, Equipment, EquipmentCheckouts,
// EquipmentRepairs, EquipmentParts). Routes import from here;
// DATA_SOURCE_EQUIPMENT decides whether a call goes to Google Sheets
// (default, today's behavior) or to Postgres. Function names and return
// shapes are identical on both sides.
//
// Vehicles, staff PINs and equipment-check reports are not here: they were
// built on Postgres from the start (lib/vehiclesDb.ts, lib/equipmentCheckDb.ts).

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/equipment";

export type {
  EquipmentCategory,
  EquipmentCheckout,
  EquipmentHolderType,
  EquipmentItem,
  EquipmentPart,
  EquipmentRepair,
  EquipmentRepairStatus,
  EquipmentStatus,
  PartStockAdjustReason,
} from "@/lib/googleSheets";

const source = () => (isPostgres("EQUIPMENT") ? pg : sheets);

export const fetchEquipmentCategories: typeof sheets.fetchEquipmentCategories = () => source().fetchEquipmentCategories();
export const appendEquipmentCategory: typeof sheets.appendEquipmentCategory = (...args) => source().appendEquipmentCategory(...args);
export const updateEquipmentCategory: typeof sheets.updateEquipmentCategory = (...args) => source().updateEquipmentCategory(...args);

export const fetchEquipmentList: typeof sheets.fetchEquipmentList = () => source().fetchEquipmentList();
export const getEquipmentById: typeof sheets.getEquipmentById = (...args) => source().getEquipmentById(...args);
export const appendEquipmentItem: typeof sheets.appendEquipmentItem = (...args) => source().appendEquipmentItem(...args);
export const updateEquipmentFields: typeof sheets.updateEquipmentFields = (...args) => source().updateEquipmentFields(...args);

export const fetchEquipmentCheckouts: typeof sheets.fetchEquipmentCheckouts = (...args) => source().fetchEquipmentCheckouts(...args);
export const appendEquipmentCheckout: typeof sheets.appendEquipmentCheckout = (...args) => source().appendEquipmentCheckout(...args);
export const getOpenCheckoutForEquipment: typeof sheets.getOpenCheckoutForEquipment = (...args) =>
  source().getOpenCheckoutForEquipment(...args);
export const updateEquipmentCheckout: typeof sheets.updateEquipmentCheckout = (...args) => source().updateEquipmentCheckout(...args);
export const staffHasEquipmentCheckoutHistory: typeof sheets.staffHasEquipmentCheckoutHistory = (...args) =>
  source().staffHasEquipmentCheckoutHistory(...args);

export const fetchEquipmentRepairs: typeof sheets.fetchEquipmentRepairs = (...args) => source().fetchEquipmentRepairs(...args);
export const getOpenRepairForEquipment: typeof sheets.getOpenRepairForEquipment = (...args) =>
  source().getOpenRepairForEquipment(...args);
export const appendEquipmentRepair: typeof sheets.appendEquipmentRepair = (...args) => source().appendEquipmentRepair(...args);
export const completeEquipmentRepair: typeof sheets.completeEquipmentRepair = (...args) => source().completeEquipmentRepair(...args);

export const fetchEquipmentParts: typeof sheets.fetchEquipmentParts = () => source().fetchEquipmentParts();
export const appendEquipmentPart: typeof sheets.appendEquipmentPart = (...args) => source().appendEquipmentPart(...args);
export const adjustEquipmentPartStock: typeof sheets.adjustEquipmentPartStock = (...args) => source().adjustEquipmentPartStock(...args);
