// Reads compared by `npx tsx scripts/migrate/parity.mts scheduling`.
import type { ParityRead } from "../parity.mts";
import {
  fetchScheduleExceptions,
  fetchSubSchedules,
  getAllSubcontractorVisits,
  getSubcontractorVisits,
} from "../../../lib/data/scheduling";

export const AREA = "SCHEDULING";

// Lookup values come from whichever source is on, so each side uses its own
// first row; equal lists mean equal values.
const firstVisit = async () => (await getAllSubcontractorVisits())[0];

export const reads: ParityRead[] = [
  { name: "fetchSubSchedules", run: () => fetchSubSchedules() },
  { name: "fetchScheduleExceptions", run: () => fetchScheduleExceptions() },
  { name: "getAllSubcontractorVisits", run: () => getAllSubcontractorVisits() },
  { name: "getSubcontractorVisits(first sub)", run: async () => getSubcontractorVisits((await firstVisit())?.subEmail ?? "") },
  {
    name: "getSubcontractorVisits(first sub, its account, other letter case)",
    run: async () => {
      const visit = await firstVisit();
      return getSubcontractorVisits((visit?.subEmail ?? "").toUpperCase(), ` ${(visit?.accountName ?? "").toUpperCase()} `);
    },
  },
  { name: "getSubcontractorVisits(first sub, other account)", run: async () => getSubcontractorVisits((await firstVisit())?.subEmail ?? "", "No Such Account") },
  { name: "getSubcontractorVisits(nobody)", run: () => getSubcontractorVisits("nobody@example.invalid") },
];
