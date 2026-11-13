// Sales (the "Sales & Commissions" tab). Routes import from here;
// DATA_SOURCE_SALES decides whether a call goes to Google Sheets (default,
// today's behavior) or to Postgres. Function names and return shapes are
// identical on both sides.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/sales";

export type { Sale, SaleInput } from "@/lib/googleSheets";

const source = () => (isPostgres("SALES") ? pg : sheets);

export const fetchSales: typeof sheets.fetchSales = () => source().fetchSales();
export const appendSale: typeof sheets.appendSale = (...args) => source().appendSale(...args);

/** Sales page → Edit. Postgres only: the old Google Sheet has no edit. */
export const updateSale: typeof pg.updateSale = async (...args) => {
  if (!isPostgres("SALES")) throw new Error("Sales can be changed only once sales are in the database.");
  return pg.updateSale(...args);
};
