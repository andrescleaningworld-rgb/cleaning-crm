# sales – verify

Run 2026-10-08 by `scripts/migrate/verify-sales.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 1.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| sales | MAIN/Sales & Commissions | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### sales

2 rows checked field by field (21 columns each): all equal.

Counts by status: Approved 2.

sale_date: 2026-08-19 to 2026-10-31; 0 rows where the text is not a date.
