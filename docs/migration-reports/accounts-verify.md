# accounts – verify

Run 2026-10-08 by `scripts/migrate/verify-accounts.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 24.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| accounts | MAIN/Accounts | 399 | 0 | 0 | 399 | 0 | 0 | 0 | 0 | ✓ |
| onboarding_checklists | MAIN/OnboardingChecklist | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | ✓ |
| account_updates | MAIN/Account Updates | 193 | 0 | 0 | 193 | 0 | 0 | 0 | 0 | ✓ |
| sub_transfer_proposals | MAIN/Sub Transfer Proposals | 72 | 0 | 0 | 72 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### accounts

399 rows checked field by field (34 columns each): all equal.

Counts by status_key: (blank) 1, active 316, cancelled 78, inactive 1, other * 1, paused 2.

start_date: 2016-01-01 to 2026-10-07; 4 rows where the text is not a date.

Sum of monthly_revenue: sheets 1116638.00 / postgres 1116638.00 ✓

### onboarding_checklists

3 rows checked field by field (6 columns each): all equal.

started_at: 2026-08-11 to 2026-09-03; 0 rows where the text is not a date.

### account_updates

193 rows checked field by field (11 columns each): all equal.

Counts by created_by: (blank) 13, Andres 127, Andres , Greg 3, Andrés 1, CW 1, Greg 48.

update_date: 2025-01-20 to 2026-10-06; 1 rows where the text is not a date.

### sub_transfer_proposals

72 rows checked field by field (15 columns each): all equal.

Counts by status: Accepted 6, Declined 4, Draft 30, Sent 32.

Sum of proposed_monthly_pay: sheets 42353.50 / postgres 42353.50 ✓
