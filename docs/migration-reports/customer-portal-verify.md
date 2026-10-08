# customer-portal – verify

Run 2026-10-08 by `scripts/migrate/verify-customer-portal.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 25.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| portal_access | PORTAL/customer-portal | 393 | 0 | 0 | 393 | 0 | 0 | 0 | 0 | ✓ |
| portal_requests | PORTAL/portal-complaints | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### portal_access

393 rows checked field by field (20 columns each): all equal.

Counts by upper(btrim(portal_access)): NO 74, YES 319.

### portal_requests

0 rows checked field by field (11 columns each): all equal.

## Request tabs

portal-complaints, portal-service-requests and portal-date-changes each have 0 rows in Sheets and 0 imported rows in Postgres (the import prints the three counts). The sheet has no portal-billing-requests tab.
