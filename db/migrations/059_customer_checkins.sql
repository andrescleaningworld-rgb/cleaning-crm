-- 059: The customer monthly check-in (lib/pg/customer-checkin.ts). Once a
-- month each active customer gets "How was your cleaning this month?" with
-- 👍 / 👎 (a signed link, no login). Off until Settings -> Reminders &
-- check-ins turns it on.
--
-- customer_checkins          one row per account per month (month 'YYYY-MM'):
--                            where it went (channel 'email' now, 'text' later),
--                            the answer ('' / 'up' / 'down') and the optional
--                            "What went wrong?" comment.
-- customer_checkin_optouts   accounts that tapped "Stop these emails": they
--                            never get one again.
--
-- Running it again changes nothing.

CREATE TABLE IF NOT EXISTS customer_checkins (
  id           BIGSERIAL PRIMARY KEY,
  account_id   TEXT NOT NULL,
  month        TEXT NOT NULL CHECK (month ~ '^\d{4}-\d{2}$'),
  channel      TEXT NOT NULL DEFAULT 'email' CHECK (channel IN ('email', 'text')),
  sent_to      TEXT NOT NULL DEFAULT '',
  sent_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  answer       TEXT NOT NULL DEFAULT '' CHECK (answer IN ('', 'up', 'down')),
  answered_at  TIMESTAMPTZ,
  comment      TEXT NOT NULL DEFAULT '',
  UNIQUE (account_id, month)
);

CREATE INDEX IF NOT EXISTS customer_checkins_answered_idx ON customer_checkins (answered_at) WHERE answer <> '';

CREATE TABLE IF NOT EXISTS customer_checkin_optouts (
  account_id    TEXT PRIMARY KEY,
  email         TEXT NOT NULL DEFAULT '',
  opted_out_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
