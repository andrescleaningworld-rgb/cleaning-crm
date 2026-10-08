// Reads compared by `npx tsx scripts/migrate/parity.mts customer-portal`.
//
// Everything here is customer data (names, phones, portal codes), and the
// parity report prints the values that differ. So every text value is
// replaced by a short fingerprint before the comparison: equal text gives an
// equal fingerprint, and a difference shows where, not what.
//
// Kept short: the Sheets side reads whole tabs (it caches them for 60 s).
import crypto from "node:crypto";
import type { ParityRead } from "../parity.mts";
import {
  getCustomerByPhone,
  getCustomerByPortalCode,
  getMergedPortalAccounts,
  getPortalNewCount,
  listPortalAccounts,
  listPortalSubmissions,
} from "../../../lib/data/customer-portal";
import { readTab } from "../lib/sheets-readonly.mjs";

export const AREA = "CUSTOMER_PORTAL";

const fingerprint = (value: unknown): unknown => {
  if (typeof value === "string") return value === "" ? "" : `#${crypto.createHash("sha256").update(value).digest("hex").slice(0, 10)}`;
  if (Array.isArray(value)) return value.map(fingerprint);
  if (value && typeof value === "object") {
    // sheetRow is ignored by the tester; here the row number matters (staff save by it).
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k === "sheetRow" ? "row" : k, fingerprint(v)]));
  }
  return value;
};
const masked = (run: () => Promise<unknown>) => async () => fingerprint(await run());

// Sample logins, picked from the sheet and never printed.
const digits = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
};
const rows = (await readTab("PORTAL", "customer-portal", { range: "A:S" })).slice(1).map((r) => ({
  phone: String(r[8] ?? ""),
  code: String(r[17] ?? ""),
  yes: String(r[18] ?? "").trim().toUpperCase() === "YES",
}));
const withPhone = rows.filter((r) => digits(r.phone).length === 10);
const yes = withPhone.filter((r) => r.yes);
const count = new Map<string, number>();
for (const r of yes) count.set(digits(r.phone), (count.get(digits(r.phone)) ?? 0) + 1);
const first = yes[0];
const last = yes[yes.length - 1];
const shared = yes.find((r) => (count.get(digits(r.phone)) ?? 0) > 1);
const turnedOff = withPhone.find((r) => !r.yes && !count.has(digits(r.phone)));
const d = digits(last?.phone ?? "");

export const reads: ParityRead[] = [
  { name: "getMergedPortalAccounts", run: masked(() => getMergedPortalAccounts()) },
  { name: "listPortalAccounts", run: masked(() => listPortalAccounts()) },
  { name: "listPortalSubmissions", run: masked(() => listPortalSubmissions()) },
  { name: "getPortalNewCount", run: () => getPortalNewCount() },
  { name: "getCustomerByPhone(first row with access)", run: masked(() => getCustomerByPhone(first?.phone ?? "")) },
  { name: "getCustomerByPhone(last row, typed as (xxx) xxx-xxxx)", run: masked(() => getCustomerByPhone(`(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`)) },
  { name: "getCustomerByPhone(last row, typed with +1)", run: masked(() => getCustomerByPhone(`+1${d}`)) },
  { name: "getCustomerByPhone(a phone several rows share)", run: masked(() => getCustomerByPhone(shared?.phone ?? "0000000000")) },
  { name: "getCustomerByPhone(a row with access turned off)", run: masked(() => getCustomerByPhone(turnedOff?.phone ?? "0000000000")) },
  { name: "getCustomerByPhone(unknown phone)", run: masked(() => getCustomerByPhone("0000000000")) },
  { name: "getCustomerByPortalCode(first row)", run: masked(() => getCustomerByPortalCode(first?.code ?? "")) },
  { name: "getCustomerByPortalCode(last row, lower case with spaces)", run: masked(() => getCustomerByPortalCode(`  ${(last?.code ?? "").toLowerCase()} `)) },
  { name: "getCustomerByPortalCode(unknown code)", run: masked(() => getCustomerByPortalCode("ZZ-NOT-A-CODE")) },
];
