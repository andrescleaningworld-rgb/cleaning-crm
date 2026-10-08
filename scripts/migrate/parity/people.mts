// Reads compared by `npx tsx scripts/migrate/parity.mts people`.
import type { ParityRead } from "../parity.mts";
import {
  fetchManagers,
  fetchStaff,
  getActiveSigningStaffById,
  getManagerCalendarColorId,
  getStaffById,
} from "../../../lib/data/people";

export const AREA = "PEOPLE";

export const reads: ParityRead[] = [
  { name: "fetchStaff", run: () => fetchStaff() },
  // Every staff member, by id, through both lookups.
  { name: "getStaffById(each)", run: async () => Promise.all((await fetchStaff()).map((s) => getStaffById(s.id))) },
  {
    name: "getActiveSigningStaffById(each)",
    run: async () => Promise.all((await fetchStaff()).map((s) => getActiveSigningStaffById(s.id))),
  },
  { name: "getStaffById(missing)", run: () => getStaffById("STF-does-not-exist") },
  { name: "getStaffById(blank)", run: () => getStaffById("  ") },
  // sheetRow is ignored by default, so check it on its own: saves address a
  // manager by this number and it must be the same on both sides.
  { name: "fetchManagers", run: () => fetchManagers() },
  { name: "fetchManagers sheetRow numbers", run: async () => (await fetchManagers()).map((m) => `${m.managerId}@${m.sheetRow}`) },
  {
    name: "getManagerCalendarColorId(each name, odd casing)",
    run: async () => Promise.all((await fetchManagers()).map((m) => getManagerCalendarColorId(`  ${m.name.toUpperCase()} `))),
  },
  { name: "getManagerCalendarColorId(unknown)", run: () => getManagerCalendarColorId("Nobody By This Name") },
];
