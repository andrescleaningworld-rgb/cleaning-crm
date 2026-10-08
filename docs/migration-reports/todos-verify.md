# todos – verify

Run 2026-10-08 by `scripts/migrate/verify-todos.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 3.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| todos | MAIN/To Do | 127 | 0 | 0 | 127 | 0 | 0 | 0 | 0 | ✓ |
| todo_sms_log | MAIN/SmsLog | 44 | 0 | 0 | 44 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### todos

127 rows checked field by field (17 columns each): all equal.

Counts by status: Cancelled 2, Done 97, Open 28.

due_date: 2026-06-29 to 2026-09-24; 1 rows where the text is not a date.

### todo_sms_log

44 rows checked field by field (8 columns each): all equal.

Counts by status: failed 43, sent 1.

sent_at: 2026-08-05 to 2026-09-23; 0 rows where the text is not a date.
