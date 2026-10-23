-- 058: Price increase reminders (lib/pg/price-review.ts). The last price
-- change is read from the account's History (every save that changes
-- "Monthly Revenue" is there); this table only keeps what History cannot:
--
-- account_price_reviews   one row per account that has one:
--   last_change_on        the date a manager set ("The price last changed
--                         on…"), for changes made before the CRM had History.
--                         The later of this and History counts.
--   snoozed_until         "Snooze 3 / 6 months": no reminder until then,
--   snooze_reason         with the reason (also written to History).
--
-- Running it again changes nothing.

CREATE TABLE IF NOT EXISTS account_price_reviews (
  account_id      TEXT PRIMARY KEY,
  last_change_on  DATE,
  set_by          TEXT NOT NULL DEFAULT '',
  set_at          TIMESTAMPTZ,
  snoozed_until   DATE,
  snooze_reason   TEXT NOT NULL DEFAULT '',
  snoozed_by      TEXT NOT NULL DEFAULT '',
  snoozed_at      TIMESTAMPTZ
);
