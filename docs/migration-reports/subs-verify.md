# subs – verify

Run 2026-10-08 by `scripts/migrate/verify-subs.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 17.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| subcontractors | MAIN/Subcontractors | 39 | 0 | 0 | 39 | 0 | 0 | 0 | 0 | ✓ |
| sub_activity_log | MAIN/Subcontractor Activity Log | 385 | 0 | 0 | 385 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### subcontractors

39 rows checked field by field (18 columns each): all equal.

Counts by status: (blank) 27, Active 10, Inactive 1, Paused 1.

insurance_expiration: – to –; 39 rows where the text is not a date.

### sub_activity_log

385 rows checked field by field (5 columns each): all equal.

Counts by action_type: Issue Reported 1, Login 182, Supply Order Submitted 4, Viewed Accounts 58, Viewed Calendar 15, Viewed Complaints 49, Viewed Order Supplies 23, Viewed Report Issue 12, Viewed Schedule 41.

logged_at: 2026-07-13 to 2026-10-06; 0 rows where the text is not a date.
