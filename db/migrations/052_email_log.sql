-- 052: the Email log. One row for every email (and offer text) the app
-- sends: sub packets, documents, transfer proposals, new-account offers,
-- customer Welcome Packets, portal invites. Office -> Email log and the
-- Email log tab on each sub's page read it (lib/pg/email-log.ts).
--
--   sent_at        when it went out (or failed)
--   channel        'email' or 'text'
--   to_address     who it went to (emails or a phone)
--   email_type     "Sub packet", "Document", "Transfer proposal", ...
--   account_*      the account it is about, when there is one
--   sub_*          the subcontractor it went to or is about, when there is one
--   sent_by        the staff member who sent it ("System" when the app did)
--   status         'sent' or 'failed' (error: why)
--   body_html / body_text   exactly what was sent ('' for old rows)
--   legacy_key     set on rows brought in from the old "Email Log" sheet tab,
--                  so bringing them in again adds nothing
--
-- Schema only. Running it again changes nothing.
CREATE TABLE IF NOT EXISTS email_log (
  id            BIGSERIAL PRIMARY KEY,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel       TEXT NOT NULL DEFAULT 'email',
  to_address    TEXT NOT NULL DEFAULT '',
  cc            TEXT NOT NULL DEFAULT '',
  subject       TEXT NOT NULL DEFAULT '',
  email_type    TEXT NOT NULL DEFAULT '',
  account_id    TEXT NOT NULL DEFAULT '',
  account_name  TEXT NOT NULL DEFAULT '',
  sub_id        TEXT NOT NULL DEFAULT '',
  sub_name      TEXT NOT NULL DEFAULT '',
  sent_by       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
  error         TEXT NOT NULL DEFAULT '',
  body_html     TEXT NOT NULL DEFAULT '',
  body_text     TEXT NOT NULL DEFAULT '',
  attachments   TEXT NOT NULL DEFAULT '',
  source        TEXT NOT NULL DEFAULT 'app',
  legacy_key    TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS email_log_sent_at_idx ON email_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS email_log_sub_idx ON email_log (sub_id) WHERE sub_id <> '';
CREATE INDEX IF NOT EXISTS email_log_account_idx ON email_log (account_id) WHERE account_id <> '';
