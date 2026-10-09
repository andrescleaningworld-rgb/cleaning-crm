// Exercises the Postgres write in lib/pg/sales.ts against the dev branch,
// checks the rows, and removes the test rows it made.
//   npx tsx scripts/migrate/check-sales-writes.mts
import { loadEnv } from "./lib/env.mjs";
import { assertDevDatabase } from "./lib/guard.mjs";

loadEnv();
process.env.DATABASE_URL = assertDevDatabase(process.env.MIGRATION_DATABASE_URL);
process.env.OUTBOUND_DRY_RUN = "1";
process.env.DATA_SOURCE_SALES = "postgres";

const data = await import("../../lib/data/sales");
const { getSql } = await import("../../lib/db");
const sql = getSql();

let failed = false;
const check = (label: string, ok: boolean, detail = "") => {
  if (!ok) failed = true;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` – ${detail}` : ""}`);
};

const NAME = "ZZ Migration Write Test";
const count = async () => ((await sql.query(`SELECT count(*)::int AS n FROM sales`)) as { n: number }[])[0].n;
const before = await count();
const lastRow = ((await sql.query(`SELECT max(sheet_row)::int AS n FROM sales`)) as { n: number }[])[0].n;
const real = ((await sql.query(`SELECT id, account_name FROM accounts WHERE id IS NOT NULL ORDER BY pk LIMIT 1`)) as { id: string; account_name: string }[])[0];
const base = { accountId: "zz-none", accountName: NAME, saleDate: "2026-10-07", serviceSold: "Carpet cleaning", workOrderEstimateNumber: "WO-1", soldBy: "Tester", amountSold: 1250.5, commissionPercent: 4, status: "Pending", notes: "n", serviceType: "Recurring", manager: "Manager", recurringStartDate: "2026-11-01", recurringEndDate: "2027-10-31" };

try {
  const id = await data.appendSale(base);
  check("appendSale returns SALE- + 14 digits", /^SALE-\d{14}$/.test(id), id);
  const list = await data.fetchSales();
  const mine = list[list.length - 1];
  check("the new sale is last, with the next row number", mine.id === id && mine.sheetRow === lastRow + 1 && list.length === before + 1);
  check(
    "values as sent; commission worked out (4% of 1250.50 = 50.02); the old Amount column mirrors Amount Sold",
    mine.accountName === NAME && mine.saleDate === "2026-10-07" && mine.amountSold === 1250.5 && mine.commissionPercent === 4 && mine.commissionAmount === 50.02 && mine.amount === 1250.5 && mine.status === "Pending" && mine.serviceType === "Recurring" && mine.manager === "Manager" && mine.recurringStartDate === "2026-11-01" && mine.recurringEndDate === "2027-10-31" && mine.workOrderEstimateNumber === "WO-1" && mine.soldBy === "Tester" && mine.notes === "n",
    String(mine.commissionAmount)
  );
  check("Created At and Updated At are the same ISO moment", mine.createdAt === mine.updatedAt && /^\d{4}-\d{2}-\d{2}T/.test(mine.createdAt));
  const stored = ((await sql.query(`SELECT sale_date::text AS d, amount_sold::text AS a, commission_amount::text AS c, recurring_end_date::text AS e, commission_amount_old_raw AS old, account_ref FROM sales WHERE sale_id = $1`, [id])) as { d: string; a: string; c: string; e: string; old: string; account_ref: string | null }[])[0];
  check("typed columns are filled; the dead Commission Amount column stays empty; unknown account unlinked", stored.d === "2026-10-07" && Number(stored.a) === 1250.5 && Number(stored.c) === 50.02 && stored.e === "2027-10-31" && stored.old === "" && stored.account_ref === null, JSON.stringify(stored));

  await data.appendSale({ ...base, accountId: real.id, accountName: "wrong name on purpose", amountSold: 0, commissionPercent: 10, recurringStartDate: "", recurringEndDate: "", serviceSold: `${NAME} linked` });
  const linked = ((await sql.query(`SELECT account_ref, commission_amount_raw FROM sales WHERE service_sold = $1`, [`${NAME} linked`])) as { account_ref: string | null; commission_amount_raw: string }[])[0];
  check("a sale sent with a real account ID is linked; a sale of 0 has a commission of 0", linked.account_ref === real.id && linked.commission_amount_raw === "0");
  check("two sales in the same second both exist", (await count()) === before + 2);
} finally {
  await sql.query(`DELETE FROM sales WHERE account_name = $1 OR service_sold LIKE $2`, [NAME, `${NAME}%`]);
  const after = await count();
  check("test rows removed; the count is back to where it started", after === before, String(after));
}

console.log(failed ? "\nFAILED" : "\nAll write checks passed.");
if (failed) process.exitCode = 1;
