-- Area 6 – Scheduling: SubSchedules, ScheduleExceptions (MAIN) and
-- subcontractor-visits (PORTAL). Idempotent. Never edit after applying.
--
-- Same conventions as 002_catalogs.sql and 007_equipment.sql (legacy_key,
-- source_sheet, source_row, *_raw next to typed columns, sheet_row).
--
-- The app addresses every one of these rows by its row number (edit,
-- deactivate, delete), so sheet_row is unique per table: imported rows keep
-- their sheet row, rows created here get the next number.
--
-- The app's own IDs (ScheduleID, ExceptionID, VisitId) are kept as text and
-- are NOT the primary key: the sheet does not force them to be filled or
-- unique, and the screens cope with that today.

-- One row = one account cleaned by one sub on a pattern. A pattern change
-- closes the row (status Superseded, effective_end set) and adds a new one.
-- sub_id_raw is what the sheet holds in SubID: the sub's email.
-- account_ref / subcontractor_id are the links worked out at import (NULL
-- when the text matches nothing); the app reads and writes the text columns.
CREATE TABLE IF NOT EXISTS sub_schedules (
  id                   BIGSERIAL PRIMARY KEY,
  legacy_key           TEXT NOT NULL UNIQUE,
  schedule_id          TEXT NOT NULL DEFAULT '',
  account_id           TEXT NOT NULL DEFAULT '',
  account_ref          TEXT,
  sub_id_raw           TEXT NOT NULL DEFAULT '',
  subcontractor_id     TEXT,
  day_of_week          TEXT NOT NULL DEFAULT '',
  time_window          TEXT NOT NULL DEFAULT '',
  recurring            TEXT NOT NULL DEFAULT '',
  effective_start_raw  TEXT NOT NULL DEFAULT '',
  effective_start      DATE,
  effective_end_raw    TEXT NOT NULL DEFAULT '',
  effective_end        DATE,
  status               TEXT NOT NULL DEFAULT '',
  submitted_by         TEXT NOT NULL DEFAULT '',
  submitted_date_raw   TEXT NOT NULL DEFAULT '',
  submitted_date       DATE,
  last_edited_by       TEXT NOT NULL DEFAULT '',
  last_edited_date_raw TEXT NOT NULL DEFAULT '',
  last_edited_at       TIMESTAMPTZ,
  frequency            TEXT NOT NULL DEFAULT '',
  monthly_occurrence   TEXT NOT NULL DEFAULT '',
  submitted_via        TEXT NOT NULL DEFAULT '',
  sheet_row            INTEGER NOT NULL UNIQUE,
  source_sheet         TEXT,
  source_row           INTEGER,
  imported_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_schedules_account_idx ON sub_schedules (account_id);
CREATE INDEX IF NOT EXISTS sub_schedules_sub_idx ON sub_schedules (lower(btrim(sub_id_raw)));

-- A one-off change to a scheduled day (skipped, moved …).
CREATE TABLE IF NOT EXISTS schedule_exceptions (
  id                BIGSERIAL PRIMARY KEY,
  legacy_key        TEXT NOT NULL UNIQUE,
  exception_id      TEXT NOT NULL DEFAULT '',
  account_id        TEXT NOT NULL DEFAULT '',
  account_ref       TEXT,
  original_date_raw TEXT NOT NULL DEFAULT '',
  original_date     DATE,
  type              TEXT NOT NULL DEFAULT '',
  new_date_raw      TEXT NOT NULL DEFAULT '',
  new_date          DATE,
  new_time_window   TEXT NOT NULL DEFAULT '',
  reason            TEXT NOT NULL DEFAULT '',
  created_by        TEXT NOT NULL DEFAULT '',
  created_date_raw  TEXT NOT NULL DEFAULT '',
  created_date      DATE,
  sheet_row         INTEGER NOT NULL UNIQUE,
  source_sheet      TEXT,
  source_row        INTEGER,
  imported_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS schedule_exceptions_account_idx ON schedule_exceptions (account_id);

-- Visits a sub logs from the portal ("I was there on …"). Named by account
-- NAME, not ID, as in the sheet. Not the customer-facing Visits tab (Area 7).
CREATE TABLE IF NOT EXISTS subcontractor_visits (
  id               BIGSERIAL PRIMARY KEY,
  legacy_key       TEXT NOT NULL UNIQUE,
  visit_id         TEXT NOT NULL DEFAULT '',
  account_name     TEXT NOT NULL DEFAULT '',
  account_ref      TEXT,
  sub_email        TEXT NOT NULL DEFAULT '',
  subcontractor_id TEXT,
  sub_name         TEXT NOT NULL DEFAULT '',
  visit_date_raw   TEXT NOT NULL DEFAULT '',
  visit_date       DATE,
  arrival_time     TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  sheet_row        INTEGER NOT NULL UNIQUE,
  source_sheet     TEXT,
  source_row       INTEGER,
  imported_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subcontractor_visits_email_idx ON subcontractor_visits (lower(btrim(sub_email)));
