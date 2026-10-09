// Reads compared by `npx tsx scripts/migrate/parity.mts subs`.
import type { ParityRead } from "../parity.mts";
import { isPostgres } from "../../../lib/dataSource";
import {
  getAllSubcontractorsRaw,
  getSubcontractorActivityLog,
  getSubcontractorsAppsScriptShape,
} from "../../../lib/data/subs";

export const AREA = "SUBS";

// The activity log follows Postgres only when the Sub portal switch is on
// too (see lib/data/subs.ts). Turn that one on for the whole run so the SUBS
// flag alone decides, which is what this comparison is about.
process.env.DATA_SOURCE_SUB_PORTAL = "postgres";

const APPS_SCRIPT_KEYS = [
  "id", "subcontractorId", "companyName", "contactName", "name", "subcontractor", "displayName", "dropdownLabel",
  "email", "address", "areasServiced", "servicesProvided", "employeeCapacity", "insuranceExpiration", "status", "notes",
] as const;

// "phone" is left out on purpose: on Postgres it is the normal Phone column
// with the second one as fallback (approved 2026-10-08), while Apps Script
// reads only the second. check-subs-writes.mts covers the new rule.
//
// "Sheets" side of this one is the live Apps Script getSubcontractors
// action (a read), cut down to the profile fields; the score fields it also
// sends are not part of the rebuilt list.
const pick = (row: Record<string, unknown>) =>
  Object.fromEntries(APPS_SCRIPT_KEYS.map((key) => [key, String(row[key] ?? "").trim()]));

async function appsScriptList(): Promise<Record<string, string>[]> {
  if (isPostgres("SUBS")) return (await getSubcontractorsAppsScriptShape()).map(pick);
  const response = await fetch(`${process.env.GOOGLE_SCRIPT_URL}?action=getSubcontractors`);
  const data = (await response.json()) as { subcontractors?: Record<string, unknown>[] };
  return (data.subcontractors ?? []).map(pick);
}

export const reads: ParityRead[] = [
  { name: "getAllSubcontractorsRaw", run: () => getAllSubcontractorsRaw() },
  { name: "getAllSubcontractorsRaw ids in order", run: async () => (await getAllSubcontractorsRaw()).map((s) => s.id) },
  { name: "getSubcontractorActivityLog", run: () => getSubcontractorActivityLog() },
  { name: "Apps Script getSubcontractors list (profile fields, without phone)", run: appsScriptList },
];
