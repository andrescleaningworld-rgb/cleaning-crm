-- Accounts: what the office records when it cancels an account in the
-- "Change status" sheet. Postgres only. Nothing here is imported from or
-- written to Google Sheets. Idempotent. Never edit after applying.
--
--   final_cleaning_date   the last day the account is cleaned. After it the
--                         account has no more cleanings on the account page,
--                         the Board, or the sub schedules. NULL = not
--                         recorded (every account cancelled before this).
--   cancellation_reason   one of the reasons in lib/cancellation.ts
--                         ("Non-payment", "Price", …). '' = not recorded.
--
-- Both are cleared when the account gets a status other than Cancelled.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS final_cleaning_date DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cancellation_reason TEXT NOT NULL DEFAULT '';
