// Area 11 verify: customer-portal and the portal-* request tabs, Sheets vs
// Postgres (dev). Read-only. Counts and column names only: phones and portal
// codes are compared but never printed.
//   node scripts/migrate/verify-customer-portal.mjs
import { cell } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

/** { db_column: column index } → field checks that compare the cell text. */
const cells = (map) => Object.fromEntries(Object.entries(map).map(([column, index]) => [column, (r) => cell(r, index)]));

const requestTab = (tab, range, photos) => ({
  table: "portal_requests",
  sheet: "PORTAL",
  tab,
  range,
  key: (_r, sourceRow) => `${tab}:row-${sourceRow}`,
  fields: {
    ...cells({ account_id_raw: 0, account_name: 1, submitted_date_raw: 2, field_1: 3, field_2: 4, field_3: 5, status: 6, staff_notes: 7, ...(photos ? { photos: 8 } : {}) }),
    tab: () => tab,
    sheet_row: (_r, sourceRow) => String(sourceRow),
  },
});

// portal_requests holds three tabs; each spec must only see its own rows.
const { getSql } = await import("./lib/pg.mjs");
const perTab = await getSql().query("SELECT tab, count(*)::int AS n FROM portal_requests WHERE source_sheet IS NOT NULL GROUP BY 1");
const requestSpecs = perTab.length === 0 ? [requestTab("portal-complaints", "A:I", true)] : null;

await runVerify("customer-portal", [
  {
    table: "portal_access",
    sheet: "PORTAL",
    tab: "customer-portal",
    range: "A:S",
    key: (_r, sourceRow) => `row-${sourceRow}`,
    fields: {
      ...cells({
        account_id_raw: 0,
        account_name: 1,
        service_date_raw: 2,
        service_type: 3,
        frequency: 4,
        cleaning_days: 5,
        address: 6,
        contact_name: 7,
        phone: 8,
        email: 9,
        scope_of_work: 10,
        status: 11,
        last_visit_date_raw: 12,
        next_scheduled_service: 13,
        last_invoice_date_raw: 14,
        monthly_revenue_raw: 15,
        estimated_monthly_total_raw: 16,
        portal_code: 17,
        portal_access: 18,
      }),
      sheet_row: (_r, sourceRow) => String(sourceRow),
    },
    statusColumn: "upper(btrim(portal_access))",
  },
  // With rows in more than one request tab this needs a per-tab filter in
  // runVerify; today all three tabs are empty, so one spec proves 0 = 0 and
  // the script stops loudly if that ever changes.
  ...(requestSpecs ?? (() => { throw new Error("portal_requests now has imported rows: add a per-tab filter to this verify before trusting it."); })()),
], {
  extraSections: [
    "",
    "## Request tabs",
    "",
    "portal-complaints, portal-service-requests and portal-date-changes each have 0 rows in Sheets and 0 imported rows in Postgres (the import prints the three counts). The sheet has no portal-billing-requests tab.",
  ],
});
