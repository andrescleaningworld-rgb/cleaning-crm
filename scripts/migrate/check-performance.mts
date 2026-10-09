// Compares the subcontractor performance scores worked out from the four
// Sheets tabs with the same scores worked out from Postgres (dev). Read-only.
// Prints counts only (no names).
//   npx tsx scripts/migrate/check-performance.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.SHEETS_READ_ONLY = "1";

const sheets = await import("../../lib/googleSheets");
const pg = await import("../../lib/pg/performance");

const [fromSheets, fromPostgres] = await Promise.all([sheets.getSubcontractorPerformanceMap(), pg.getSubcontractorPerformanceMap()]);

const sameKeys = fromSheets.size === fromPostgres.size && [...fromSheets.keys()].every((key, i) => [...fromPostgres.keys()][i] === key);
const different = new Map<string, number>();
let subsDifferent = 0;
for (const [key, a] of fromSheets) {
  const b = fromPostgres.get(key);
  let diff = !b;
  for (const field of Object.keys(a) as (keyof typeof a)[]) {
    if (!b || a[field] !== b[field]) {
      diff = true;
      different.set(field, (different.get(field) ?? 0) + 1);
    }
  }
  if (diff) subsDifferent++;
}
const withComplaints = [...fromSheets.values()].filter((p) => p.score < 10).length;
const ok = sameKeys && subsDifferent === 0;
console.log(
  `${ok ? "SAME  " : "DIFF  "} performance scores: Sheets ${fromSheets.size} subs / Postgres ${fromPostgres.size} subs; same subs in the same order: ${sameKeys}; subs with a different value: ${subsDifferent}` +
    (different.size ? ` (${[...different].map(([k, n]) => `${k} in ${n}`).join(", ")})` : "") +
    `; subs scoring under 10: ${withComplaints}`
);
if (!ok) process.exitCode = 1;
