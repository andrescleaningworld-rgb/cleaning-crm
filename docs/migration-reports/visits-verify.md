# visits – verify

Run 2026-10-08 by `scripts/migrate/verify-visits.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 39.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| visits | MAIN/Visits | 614 | 0 | 0 | 614 | 0 | 0 | 0 | 1 | ✓ |
| visit_edit_log | MAIN/VisitEditLog | 6 | 0 | 0 | 6 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### visits

614 rows checked field by field (14 columns each): all equal.

Counts by follow_up_needed: (blank) 411, No 195, Yes 9.

visit_date: 2001-01-01 to 2026-10-08; 1 rows where the text is not a date.

### visit_edit_log

6 rows checked field by field (5 columns each): all equal.

edited_at: 2026-08-19 to 2026-09-16; 0 rows where the text is not a date.
