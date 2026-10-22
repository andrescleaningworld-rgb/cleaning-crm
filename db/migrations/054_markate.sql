-- 054: Markate. Accepted commercial estimates with a recurring line item come
-- into the CRM (Accounts Center -> New accounts -> "From Markate", and a paper
-- in the Pin Board's "New accepted" square). lib/pg/markate.ts reads and
-- writes these tables.
--
-- markate_connection        the one Markate login (Settings -> Markate). Only
--                           ever one row (id = 1). The tokens are stored
--                           encrypted (AES-256-GCM, lib/markate.ts), never
--                           in plain text.
-- markate_estimates         one row per Markate estimate that matched. An
--                           estimate that did not match is not saved.
--                           outcome: 'waiting' (in the list), 'started'
--                           (account_id is the new account) or 'skipped'.
-- markate_recurring_items   the line item names that count as recurring
--                           (exact name, any case). Seeded with four.
--
-- Running it again changes nothing.
CREATE TABLE IF NOT EXISTS markate_connection (
  id                 INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  access_token_enc   TEXT NOT NULL,
  refresh_token_enc  TEXT NOT NULL,
  expires_at         TIMESTAMPTZ NOT NULL,
  markate_user_id    TEXT NOT NULL DEFAULT '',
  scope              TEXT NOT NULL DEFAULT '',
  connected_by       TEXT NOT NULL DEFAULT '',
  connected_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  refreshed_at       TIMESTAMPTZ,
  last_checked_at    TIMESTAMPTZ,
  last_check_error   TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS markate_estimates (
  id                   BIGSERIAL PRIMARY KEY,
  markate_estimate_id  TEXT NOT NULL UNIQUE,
  estimate_number      TEXT NOT NULL DEFAULT '',
  customer_id          TEXT NOT NULL DEFAULT '',
  customer_name        TEXT NOT NULL DEFAULT '',
  customer             JSONB NOT NULL DEFAULT '{}'::jsonb,
  total                NUMERIC(12, 2) NOT NULL DEFAULT 0,
  recurring_total      NUMERIC(12, 2) NOT NULL DEFAULT 0,
  status               TEXT NOT NULL DEFAULT '',
  estimate_date        TEXT NOT NULL DEFAULT '',
  url_public           TEXT NOT NULL DEFAULT '',
  matched_item         TEXT NOT NULL DEFAULT '',
  matched_why          TEXT NOT NULL DEFAULT '' CHECK (matched_why IN ('', 'name', 'per month')),
  raw                  JSONB NOT NULL DEFAULT '{}'::jsonb,
  found_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  outcome              TEXT NOT NULL DEFAULT 'waiting' CHECK (outcome IN ('waiting', 'started', 'skipped')),
  account_id           TEXT NOT NULL DEFAULT '',
  outcome_by           TEXT NOT NULL DEFAULT '',
  outcome_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS markate_estimates_waiting_idx ON markate_estimates (found_at DESC) WHERE outcome = 'waiting';

CREATE TABLE IF NOT EXISTS markate_recurring_items (
  id        BIGSERIAL PRIMARY KEY,
  name      TEXT NOT NULL,
  added_by  TEXT NOT NULL DEFAULT '',
  added_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS markate_recurring_items_name_idx ON markate_recurring_items (lower(btrim(name)));

INSERT INTO markate_recurring_items (name, added_by) VALUES
  ('Office Cleaning', 'Setup'),
  ('Common Area Cleaning', 'Setup'),
  ('Ongoing Facility Cleaning', 'Setup'),
  ('Porter Service', 'Setup')
ON CONFLICT DO NOTHING;
