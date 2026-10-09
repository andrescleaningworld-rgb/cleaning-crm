# people – verify

Run 2026-10-08 by `scripts/migrate/verify-people.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 1.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| staff | MAIN/Staff | 15 | 0 | 0 | 15 | 0 | 0 | 0 | 0 | ✓ |
| managers | MAIN/Managers | 6 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### staff

15 rows checked field by field (4 columns each): all equal.

Counts by role: InsideStaff 8, Manager 7.

### managers

6 rows checked field by field (8 columns each): all equal.

Counts by status: Active 6.
