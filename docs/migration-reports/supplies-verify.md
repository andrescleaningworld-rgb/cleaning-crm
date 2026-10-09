# supplies – verify

Run 2026-10-08 by `scripts/migrate/verify-supplies.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 0.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| sub_supplies | MAIN/Supplies | 51 | 0 | 0 | 51 | 0 | 0 | 0 | 0 | ✓ |
| sub_supply_orders | MAIN/Supply Orders | 13 | 0 | 0 | 13 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### sub_supplies

51 rows checked field by field (14 columns each): all equal.

Counts by category: (blank) 48, Misc 1, Paper 2.

### sub_supply_orders

13 rows checked field by field (15 columns each): all equal.

Counts by status: Approved 6, Completed 2, Denied 2, Needs Review 3.

ordered_on: 2026-06-25 to 2026-09-01; 0 rows where the text is not a date.
