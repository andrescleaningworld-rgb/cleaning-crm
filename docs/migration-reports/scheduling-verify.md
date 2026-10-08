# scheduling – verify

Run 2026-10-08 by `scripts/migrate/verify-scheduling.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 27.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| sub_schedules | MAIN/SubSchedules | 298 | 0 | 0 | 298 | 0 | 0 | 0 | 0 | ✓ |
| schedule_exceptions | MAIN/ScheduleExceptions | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |
| subcontractor_visits | PORTAL/subcontractor-visits | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### sub_schedules

298 rows checked field by field (17 columns each): all equal.

Counts by status: Active 298.

effective_start: 2026-07-06 to 2026-09-03; 3 rows where the text is not a date.

### schedule_exceptions

0 rows checked field by field (10 columns each): all equal.

Counts by type: none.

original_date: – to –; 0 rows where the text is not a date.

### subcontractor_visits

1 rows checked field by field (8 columns each): all equal.

visit_date: 2026-07-20 to 2026-07-20; 0 rows where the text is not a date.
