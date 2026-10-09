-- Area 9 – To-Dos: To Do and SmsLog (MAIN). Idempotent. Never edit after
-- applying.
--
-- Same conventions as the earlier areas (legacy_key, source_sheet,
-- source_row, *_raw next to typed columns, sheet_row).
--
-- Every column of the To Do tab is kept as the text the sheet shows, because
-- the app's rules read the text: Calendar Sync Failed is true only for the
-- exact text "TRUE", Sync To Calendar is off only for the exact text
-- "FALSE" (blank = on), Priority falls back to Medium when it is not one of
-- the three known words.
--
--   todo_id      column A, "TODO-<stamp>". Text, not the key: a few old rows
--                were written into the wrong columns and have no ID (the
--                app hides them; they are kept here).
--   account_id_raw  column P: the account's id, filled only by the
--                onboarding flow. account_ref is the link worked out at
--                import (by that id, else by exact account name).
--   sheet_row    unique. The bulk-edit path addresses rows by it, and new
--                rows go after the last one.
CREATE TABLE IF NOT EXISTS todos (
  id                       BIGSERIAL PRIMARY KEY,
  legacy_key               TEXT NOT NULL UNIQUE,
  todo_id                  TEXT NOT NULL DEFAULT '',
  created_date_raw         TEXT NOT NULL DEFAULT '',
  created_date             DATE,
  due_date_raw             TEXT NOT NULL DEFAULT '',
  due_date                 DATE,
  assigned_to              TEXT NOT NULL DEFAULT '',
  account_name             TEXT NOT NULL DEFAULT '',
  account_ref              TEXT,
  task_type                TEXT NOT NULL DEFAULT '',
  why                      TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  group_id                 TEXT NOT NULL DEFAULT '',
  outcome                  TEXT NOT NULL DEFAULT '',
  calendar_event_id        TEXT NOT NULL DEFAULT '',
  calendar_sync_failed_raw TEXT NOT NULL DEFAULT '',
  sync_to_calendar_raw     TEXT NOT NULL DEFAULT '',
  priority_raw             TEXT NOT NULL DEFAULT '',
  account_id_raw           TEXT NOT NULL DEFAULT '',
  sheet_row                INTEGER NOT NULL UNIQUE,
  source_sheet             TEXT,
  source_row               INTEGER,
  imported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todos_todo_id_idx ON todos (todo_id);
CREATE INDEX IF NOT EXISTS todos_status_idx ON todos (lower(btrim(status)));
CREATE INDEX IF NOT EXISTS todos_due_idx ON todos (due_date);

-- One row per text message attempt for a to-do (a resend adds a row).
-- text_id is the text provider's id for that send; blank when the attempt
-- failed before the provider answered. manager_phone is a phone number:
-- never print it in reports or logs.
CREATE TABLE IF NOT EXISTS todo_sms_log (
  id                  BIGSERIAL PRIMARY KEY,
  legacy_key          TEXT NOT NULL UNIQUE,
  todo_id             TEXT NOT NULL DEFAULT '',
  text_id             TEXT NOT NULL DEFAULT '',
  manager_phone       TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT '',
  sent_at_raw         TEXT NOT NULL DEFAULT '',
  sent_at             TIMESTAMPTZ,
  last_checked_at_raw TEXT NOT NULL DEFAULT '',
  last_checked_at     TIMESTAMPTZ,
  quota_remaining_raw TEXT NOT NULL DEFAULT '',
  sheet_row           INTEGER NOT NULL UNIQUE,
  source_sheet        TEXT,
  source_row          INTEGER,
  imported_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS todo_sms_log_todo_idx ON todo_sms_log (todo_id);
CREATE INDEX IF NOT EXISTS todo_sms_log_text_idx ON todo_sms_log (text_id);
