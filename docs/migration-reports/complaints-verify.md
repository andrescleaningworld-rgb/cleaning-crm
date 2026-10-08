# complaints – verify

Run 2026-10-08 by `scripts/migrate/verify-complaints.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 0.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| complaints | MAIN/Complaints | 22 | 0 | 0 | 22 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### complaints

22 rows checked field by field (17 columns each): all equal.

Counts by status: Closed 12, Open 6, Resolved by Sub 4.

complaint_date: 2026-06-15 to 2026-09-22; 0 rows where the text is not a date.
