# sub-portal – verify

Run 2026-10-08 by `scripts/migrate/verify-sub-portal.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 0.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| sub_portal_issues | MAIN/Sub Portal Issues | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | ✓ |
| photos | MAIN/Photos | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### sub_portal_issues

1 rows checked field by field (13 columns each): all equal.

Counts by status: Reviewed 1.

reported_on: 2026-07-25 to 2026-07-25; 0 rows where the text is not a date.

### photos

3 rows checked field by field (15 columns each): all equal.

Counts by source_type: Complaint 3.

taken_on: 2026-06-24 to 2026-06-24; 0 rows where the text is not a date.
