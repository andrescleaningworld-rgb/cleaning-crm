// Compares the account lists rebuilt from Postgres (lib/pg/accounts.ts,
// getAccountsAppsScriptShape) with what the Apps Script backend returns for
// getAccounts / getAllAccounts / getMapAccounts: every row, every field,
// exact text.
//
//   npx tsx scripts/migrate/check-accounts-apps-script.mts [--cache <dir>] [--fresh]
//
// Apps Script is the live production backend and is slow (one of these reads
// has taken over two minutes), so answers are cached as JSON in <dir>
// (default: a folder in the system temp dir, never in the repo: the lists
// hold key codes, revenue and pay). --fresh fetches again, one call at a
// time, 20 seconds apart. Run the accounts import first so both sides are
// from the same moment. Prints counts only.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);

const args = process.argv.slice(2);
const cacheDir = args.includes("--cache") ? args[args.indexOf("--cache") + 1] : path.join(os.tmpdir(), "cw-apps-script-cache");
const fresh = args.includes("--fresh");
fs.mkdirSync(cacheDir, { recursive: true });

const { getAccountsAppsScriptShape } = await import("../../lib/pg/accounts");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let failed = false;
for (const action of ["getAccounts", "getAllAccounts", "getMapAccounts"]) {
  const file = path.join(cacheDir, `${action}.json`);
  if (fresh || !fs.existsSync(file)) {
    const started = Date.now();
    const response = await fetch(`${process.env.GOOGLE_SCRIPT_URL}?action=${action}`);
    const body = await response.text();
    try {
      JSON.parse(body);
      fs.writeFileSync(file, body);
      console.log(`fetched ${action} in ${Math.round((Date.now() - started) / 1000)}s`);
    } catch {
      console.log(`SKIP   ${action}: Apps Script did not answer with JSON (status ${response.status} after ${Math.round((Date.now() - started) / 1000)}s). Not retried.`);
      await sleep(20000);
      continue;
    }
    await sleep(20000);
  }

  const data = JSON.parse(fs.readFileSync(file, "utf8")) as { accounts?: Record<string, unknown>[]; data?: Record<string, unknown>[] };
  const theirs = data.accounts ?? data.data ?? [];
  const ours = await getAccountsAppsScriptShape(action);

  const differentFields = new Map<string, number>();
  let rowsDifferent = 0;
  const sameKeys = theirs.length > 0 && ours.length > 0 && JSON.stringify(Object.keys(theirs[0])) === JSON.stringify(Object.keys(ours[0]));
  const sameOrder = theirs.length === ours.length && theirs.every((row, i) => row.id === ours[i].id);
  if (sameOrder) {
    theirs.forEach((row, i) => {
      let different = false;
      for (const key of new Set([...Object.keys(row), ...Object.keys(ours[i])])) {
        if (row[key] !== ours[i][key]) {
          different = true;
          differentFields.set(key, (differentFields.get(key) ?? 0) + 1);
        }
      }
      if (different) rowsDifferent++;
    });
  }
  const ok = sameKeys && sameOrder && rowsDifferent === 0;
  if (!ok) failed = true;
  console.log(
    `${ok ? "SAME  " : "DIFF  "} ${action}: Apps Script ${theirs.length} rows / Postgres ${ours.length} rows, ` +
      `same fields in the same order: ${sameKeys}, same accounts in the same order: ${sameOrder}, rows that differ: ${rowsDifferent}` +
      (differentFields.size ? ` (${[...differentFields].map(([key, n]) => `${key} ×${n}`).join(", ")})` : "")
  );
}
process.exitCode = failed ? 1 : 0;
