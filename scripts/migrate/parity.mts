// Parity tester: runs each read function of an area once with
// DATA_SOURCE_<AREA>=sheets and once with =postgres, and deep-diffs the JSON.
//
//   npx tsx scripts/migrate/parity.mts <area>        e.g. catalogs
//   npx tsx scripts/migrate/parity.mts --self-test   checks the diff logic only
//
// (.mts, not .mjs: it has to import the app's TypeScript in lib/data/*.)
//
// Each area lists its reads in scripts/migrate/parity/<area>.mts:
//
//   export const AREA = "CATALOGS";                       // a DataSourceArea
//   export const reads: ParityRead[] = [
//     { name: "getExtraServices", run: () => getExtraServices() },
//     { name: "getDocuments", run: () => getDocuments(), sortBy: "id" },
//   ];
//
// Reads only. Postgres is always the dev branch: DATABASE_URL is replaced
// with the guarded MIGRATION_DATABASE_URL before any app code is imported.
// Read functions must not go through a cache that survives the flag flip.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { deepDiff, sortByKey } from "./lib/diff.mjs";
import { loadEnv, REPO_ROOT } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";
import { table, writeReport } from "./lib/report.mjs";

export type ParityRead = {
  name: string;
  run: () => Promise<unknown>;
  /** Sort both results by this key first, when row order is not meaningful. */
  sortBy?: string;
  /** Extra keys to ignore besides sheetRow. */
  ignoreKeys?: string[];
};

type Diff = { path: string; sheets: unknown; postgres: unknown };

function selfTest(): boolean {
  const cases: [string, unknown, unknown, number][] = [
    ["identical", { a: 1, b: [1, 2] }, { a: 1, b: [1, 2] }, 0],
    ["sheetRow ignored", [{ id: "A", sheetRow: 5 }], [{ id: "A" }], 0],
    ["missing vs undefined", { a: 1, b: undefined }, { a: 1 }, 0],
    ["value differs", { a: 1 }, { a: 2 }, 1],
    ["type differs", { a: "1" }, { a: 1 }, 1],
    ["array length differs", [1, 2], [1, 2, 3], 1],
    ["null vs empty string", { a: null }, { a: "" }, 1],
  ];
  let ok = true;
  for (const [label, a, b, expected] of cases) {
    const got = deepDiff(a, b).length;
    if (got !== expected) ok = false;
    console.log(`${got === expected ? "PASS" : "FAIL"}  ${label} (${got} diffs, expected ${expected})`);
  }
  const sorted = deepDiff(sortByKey([{ id: "B" }, { id: "A" }], "id"), sortByKey([{ id: "A" }, { id: "B" }], "id")).length;
  if (sorted !== 0) ok = false;
  console.log(`${sorted === 0 ? "PASS" : "FAIL"}  sortBy lines rows up`);
  return ok;
}

const show = (value: unknown) => {
  const text = JSON.stringify(value);
  return text === undefined ? "(missing)" : text.length > 80 ? `${text.slice(0, 80)}…` : text;
};

async function main(): Promise<number> {
  const arg = process.argv[2];
  if (arg === "--self-test") return selfTest() ? 0 : 1;
  if (!arg) {
    console.error("Usage: npx tsx scripts/migrate/parity.mts <area> | --self-test");
    return 1;
  }

  const area = arg.toLowerCase();
  const file = path.join(REPO_ROOT, "scripts", "migrate", "parity", `${area}.mts`);
  if (!fs.existsSync(file)) {
    console.error(`No parity list for "${area}" yet (expected scripts/migrate/parity/${area}.mts).`);
    return 1;
  }

  loadEnv();
  process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
  process.env.OUTBOUND_DRY_RUN = "1";

  const mod = (await import(pathToFileURL(file).href)) as { AREA: string; reads: ParityRead[] };
  const flag = `DATA_SOURCE_${mod.AREA}`;

  const rows: string[][] = [];
  const details: string[] = [];
  let different = 0;

  for (const read of mod.reads) {
    const results: Record<string, unknown> = {};
    let error = "";
    for (const source of ["sheets", "postgres"]) {
      process.env[flag] = source;
      try {
        const value = await read.run();
        results[source] = read.sortBy && Array.isArray(value) ? sortByKey(value, read.sortBy) : value;
      } catch (e) {
        error = `${source} threw: ${e instanceof Error ? e.message : String(e)}`;
        break;
      }
    }
    delete process.env[flag];

    if (error) {
      different++;
      rows.push([read.name, "ERROR", error]);
      console.log(`ERROR  ${read.name} – ${error}`);
      continue;
    }

    const diffs: Diff[] = deepDiff(results.sheets, results.postgres, {
      ignoreKeys: ["sheetRow", ...(read.ignoreKeys ?? [])],
    });
    const size = Array.isArray(results.sheets) ? `${results.sheets.length} rows` : "1 value";
    if (diffs.length === 0) {
      rows.push([read.name, "identical", size]);
      console.log(`SAME   ${read.name} (${size})`);
    } else {
      different++;
      rows.push([read.name, `${diffs.length} differences`, size]);
      console.log(`DIFF   ${read.name} – ${diffs.length} differences`);
      details.push(
        `### ${read.name}\n\n` +
          table(["Where", "Sheets", "Postgres"], diffs.slice(0, 25).map((d) => [d.path || "(whole value)", show(d.sheets), show(d.postgres)])) +
          (diffs.length > 25 ? `\n\n…and ${diffs.length - 25} more.` : "")
      );
    }
  }

  const report = [
    `# Parity – ${area}`,
    "",
    `Each read function run with \`${flag}=sheets\` and \`=postgres\`, JSON compared (ignoring \`sheetRow\`).`,
    "",
    `**${mod.reads.length - different} identical, ${different} different.**`,
    "",
    table(["Read", "Result", "Size / note"], rows),
    ...(details.length ? ["", "## Differences", "", details.join("\n\n")] : []),
  ].join("\n");
  console.log(`Report: ${writeReport(area, report, "parity")}`);
  return different === 0 ? 0 : 1;
}

process.exitCode = await main();
