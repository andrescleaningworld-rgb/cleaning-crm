-- 072: "Price & frequency change" on an existing account (more cleanings and
-- a new price: not a new account, not an extra job).
--
--   account_price_changes   One row per change saved from the account page:
--                           the effective date, the schedule before and after
--                           (in words), the CW monthly price and the sub's
--                           monthly pay before and after (all before tax), the
--                           signed estimate (Blob link), a note and who saved
--                           it. The account itself is updated by the app's
--                           usual account save; this table is the record.
--                           The Sales page counts new_price - old_price as
--                           upsell revenue; the account page lists the rows as
--                           "Change history"; the Photos page files the
--                           estimate as "Accepted estimate".
--
-- Only adds a table. Nothing existing is changed.

CREATE TABLE IF NOT EXISTS account_price_changes (
  id              BIGSERIAL PRIMARY KEY,
  account_id      TEXT NOT NULL,
  account_name    TEXT NOT NULL DEFAULT '',
  effective_date  DATE NOT NULL,
  -- The day the new schedule really starts ("" schedule unchanged): never
  -- before today, and an every-2-weeks schedule may move to its next "on" week.
  schedule_start  DATE,
  old_schedule    TEXT NOT NULL DEFAULT '',
  new_schedule    TEXT NOT NULL DEFAULT '',
  old_frequency   TEXT NOT NULL DEFAULT '',
  new_frequency   TEXT NOT NULL DEFAULT '',
  old_price       NUMERIC(12, 2),
  new_price       NUMERIC(12, 2),
  old_sub_pay     NUMERIC(12, 2),
  new_sub_pay     NUMERIC(12, 2),
  estimate_url    TEXT NOT NULL DEFAULT '',
  estimate_name   TEXT NOT NULL DEFAULT '',
  note            TEXT NOT NULL DEFAULT '',
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_price_changes_account_idx ON account_price_changes (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS account_price_changes_effective_idx ON account_price_changes (effective_date);
