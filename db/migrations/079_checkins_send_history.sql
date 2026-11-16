-- 079: Customer check-ins, sent by staff (lib/pg/customer-checkin.ts).
-- Replaces the monthly automatic send of 059: a check-in now goes out only
-- when someone presses Send (one account, picked accounts, or a saved list),
-- at most 90 a day; the rest wait as 'queued' and the daily job sends them
-- over the next days. The answer is 😀 Great / 😐 OK / 😟 Needs attention,
-- with an optional comment and photos.
--
-- customer_checkins (from 059; it had no rows on production, checked Nov 16)
--   one row per check-in sent to an account (no longer one per month):
--     status       'queued' (waiting for the daily limit), 'sent', 'failed',
--                  'skipped' (could not go when its turn came, why in error)
--     batch_id     the send it was part of (checkin_batches)
--     sent_by      who pressed Send
--     created_at   when it was asked for; sent_at = when it went (NULL while queued)
--     subject, email_html   the exact email sent: the saved copy ("View email")
--     manager_name the manager who signed it
--     answer       '' / 'great' / 'ok' / 'attention' ('up' / 'down' from 059 still allowed)
--     photos       comma-separated links of the photos sent with the answer
--     error        why it failed or was skipped
-- checkin_batches        one row per press of Send: who, when, how
--                        ('single' / 'picked' / 'list'), the list's name,
--                        and the skipped accounts with the reason (jsonb).
-- checkin_lists          saved lists of accounts ("Drew's accounts").
-- checkin_list_accounts  the accounts on each list.
--
-- customer_checkin_optouts (059) is unchanged: "Stop these emails".
-- Safe to run twice.

ALTER TABLE customer_checkins DROP CONSTRAINT IF EXISTS customer_checkins_account_id_month_key;
ALTER TABLE customer_checkins DROP CONSTRAINT IF EXISTS customer_checkins_answer_check;
ALTER TABLE customer_checkins ADD CONSTRAINT customer_checkins_answer_check CHECK (answer IN ('', 'great', 'ok', 'attention', 'up', 'down'));
ALTER TABLE customer_checkins ALTER COLUMN sent_at DROP NOT NULL;
ALTER TABLE customer_checkins ALTER COLUMN sent_at DROP DEFAULT;

ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS status       TEXT NOT NULL DEFAULT 'sent';
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS batch_id     BIGINT;
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS sent_by      TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS created_at   TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS subject      TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS email_html   TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS manager_name TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS photos       TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS error        TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_checkins DROP CONSTRAINT IF EXISTS customer_checkins_status_check;
ALTER TABLE customer_checkins ADD CONSTRAINT customer_checkins_status_check CHECK (status IN ('queued', 'sent', 'failed', 'skipped'));

CREATE TABLE IF NOT EXISTS checkin_batches (
  id          BIGSERIAL PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL DEFAULT '',
  kind        TEXT NOT NULL DEFAULT 'picked' CHECK (kind IN ('single', 'picked', 'list')),
  list_id     BIGINT,
  list_name   TEXT NOT NULL DEFAULT '',
  skipped     JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS checkin_lists (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS checkin_lists_name_idx ON checkin_lists (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS checkin_list_accounts (
  list_id     BIGINT NOT NULL REFERENCES checkin_lists (id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL,
  PRIMARY KEY (list_id, account_id)
);

CREATE INDEX IF NOT EXISTS customer_checkins_account_idx ON customer_checkins (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS customer_checkins_batch_idx ON customer_checkins (batch_id);
CREATE INDEX IF NOT EXISTS customer_checkins_queued_idx ON customer_checkins (created_at) WHERE status = 'queued';
