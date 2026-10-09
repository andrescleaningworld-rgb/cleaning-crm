// Reads compared by `npx tsx scripts/migrate/parity.mts equipment`.
import type { ParityRead } from "../parity.mts";
import {
  fetchEquipmentCategories,
  fetchEquipmentCheckouts,
  fetchEquipmentList,
  fetchEquipmentParts,
  fetchEquipmentRepairs,
  getEquipmentById,
  getOpenCheckoutForEquipment,
  getOpenRepairForEquipment,
  staffHasEquipmentCheckoutHistory,
} from "../../../lib/data/equipment";

export const AREA = "EQUIPMENT";

// IDs for the by-id reads come from whichever source is on, so each side
// looks up its own first row; equal lists mean equal ids.
const firstEquipmentId = async () => (await fetchEquipmentList())[0]?.id ?? "";

export const reads: ParityRead[] = [
  { name: "fetchEquipmentCategories", run: () => fetchEquipmentCategories() },
  { name: "fetchEquipmentList", run: () => fetchEquipmentList() },
  { name: "getEquipmentById(first)", run: async () => getEquipmentById(await firstEquipmentId()) },
  { name: "getEquipmentById(missing)", run: () => getEquipmentById("EQP-does-not-exist") },
  { name: "fetchEquipmentCheckouts()", run: () => fetchEquipmentCheckouts() },
  { name: "fetchEquipmentCheckouts(first item)", run: async () => fetchEquipmentCheckouts(await firstEquipmentId()) },
  { name: "getOpenCheckoutForEquipment(first item)", run: async () => getOpenCheckoutForEquipment(await firstEquipmentId()) },
  { name: "fetchEquipmentRepairs()", run: () => fetchEquipmentRepairs() },
  { name: "fetchEquipmentRepairs(first item)", run: async () => fetchEquipmentRepairs(await firstEquipmentId()) },
  { name: "getOpenRepairForEquipment(first item)", run: async () => getOpenRepairForEquipment(await firstEquipmentId()) },
  { name: "fetchEquipmentParts", run: () => fetchEquipmentParts() },
  {
    name: "staffHasEquipmentCheckoutHistory(first signer)",
    run: async () => staffHasEquipmentCheckoutHistory((await fetchEquipmentCheckouts())[0]?.signedOutByStaffId ?? ""),
  },
  { name: "staffHasEquipmentCheckoutHistory(nobody)", run: () => staffHasEquipmentCheckoutHistory("STF-does-not-exist") },
];
