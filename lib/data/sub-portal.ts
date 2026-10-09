// The subcontractor portal. Today it goes through Apps Script inside
// app/api/subcontractor-portal, app/api/notifications and
// app/api/subcontractor-issues; with DATA_SOURCE_SUB_PORTAL set to
// "postgres" those routes use the functions below instead and Apps Script
// is not called. Unset (the default) changes nothing.
//
// On Postgres the portal reads subcontractors, accounts, complaints and
// supplies from Postgres too, so this switch goes on last, after those
// areas.

import { isPostgres } from "@/lib/dataSource";

export {
  getSubPortalByEmail,
  getSubPortalIssuesShape,
  logSubcontractorActivity,
  submitSubPortalIssue,
  updateSubPortalIssueStatus,
} from "@/lib/pg/sub-portal";
export type { NewSubPortalIssue, SubPortalData, SubPortalIssue } from "@/lib/pg/sub-portal";

export const subPortalOnPostgres = () => isPostgres("SUB_PORTAL");
