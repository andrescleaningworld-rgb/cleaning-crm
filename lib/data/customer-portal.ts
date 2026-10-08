// Customer portal (the customer-portal tab and the portal-* request tabs).
// Routes import from here; DATA_SOURCE_CUSTOMER_PORTAL decides whether a
// call goes to Google Sheets (default, today's behavior) or to Postgres.
// Function names and return shapes are identical on both sides.
//
// Not here: the requests, complaints and history of the older
// /customer-portal pages. They go to Apps Script (app/api/customer-portal)
// and stay there.

import { isPostgres } from "@/lib/dataSource";
import * as sheets from "@/lib/googleSheets";
import * as pg from "@/lib/pg/customer-portal";

export { normalizePhone } from "@/lib/googleSheets";
export type { MergedPortalAccount, PortalSubmission } from "@/lib/googleSheets";

const source = () => (isPostgres("CUSTOMER_PORTAL") ? pg : sheets);

export const getCustomerByPortalCode: typeof sheets.getCustomerByPortalCode = (...args) => source().getCustomerByPortalCode(...args);
export const getCustomerByPhone: typeof sheets.getCustomerByPhone = (...args) => source().getCustomerByPhone(...args);
export const getMergedPortalAccounts: typeof sheets.getMergedPortalAccounts = () => source().getMergedPortalAccounts();
export const enablePortalAccount: typeof sheets.enablePortalAccount = (...args) => source().enablePortalAccount(...args);
export const updatePortalAccountFields: typeof sheets.updatePortalAccountFields = (...args) => source().updatePortalAccountFields(...args);
export const listPortalAccounts: typeof sheets.listPortalAccounts = () => source().listPortalAccounts();
export const getPortalNewCount: typeof sheets.getPortalNewCount = () => source().getPortalNewCount();
export const listPortalSubmissions: typeof sheets.listPortalSubmissions = () => source().listPortalSubmissions();
export const updateSubmissionStatus: typeof sheets.updateSubmissionStatus = (...args) => source().updateSubmissionStatus(...args);

/**
 * Saves one request a customer sent from /portal. On Sheets this is the same
 * appendToSheet(tab, values) call the routes made before.
 */
export const appendPortalRequest: typeof pg.appendPortalRequest = (tab, values) =>
  isPostgres("CUSTOMER_PORTAL") ? pg.appendPortalRequest(tab, values) : sheets.appendToSheet(tab, values);
