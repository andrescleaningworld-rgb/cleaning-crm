-- Area 7 – Visits: Visits and VisitEditLog (MAIN). Idempotent. Never edit
-- after applying.
--
-- Same conventions as the earlier areas (legacy_key, source_sheet,
-- source_row, *_raw next to typed columns, sheet_row).
--
-- Visits is the manager visit log: the tab Apps Script's getVisits / addVisit
-- read and write, and the Visit page edits directly.
--
--   visit_id        column A, "VISIT-<14 digits>" for visits added by the app.
--                   Text, not the key: the sheet does not force it.
--   account_id_raw  column B. In Sheets this is a FORMULA: "ACC-" + the row
--                   number + 100000 in hex. It is a row number in disguise
--                   and matches no account. Kept as text because the app
--                   returns it; never used as a link.
--   account_ref     the real link: accounts.id found by exact account name
--                   at import (NULL when no or several accounts match).
--   follow_up_date_old_raw  column I, a second, always-empty "Follow-up
--                   Date" header. Kept so nothing is lost; the app reads M.
--   sheet_row       unique: the app's IDs for new rows depend on the position
--                   and rows are read in this order.
CREATE TABLE IF NOT EXISTS visits (
  id                     BIGSERIAL PRIMARY KEY,
  legacy_key             TEXT NOT NULL UNIQUE,
  visit_id               TEXT NOT NULL DEFAULT '',
  account_id_raw         TEXT NOT NULL DEFAULT '',
  account_name           TEXT NOT NULL DEFAULT '',
  account_ref            TEXT,
  visit_date_raw         TEXT NOT NULL DEFAULT '',
  visit_date             DATE,
  visit_type             TEXT NOT NULL DEFAULT '',
  completed_by           TEXT NOT NULL DEFAULT '',
  condition_raw          TEXT NOT NULL DEFAULT '',
  condition_score        NUMERIC,
  follow_up_needed       TEXT NOT NULL DEFAULT '',
  follow_up_date_old_raw TEXT NOT NULL DEFAULT '',
  notes                  TEXT NOT NULL DEFAULT '',
  created_at_raw         TEXT NOT NULL DEFAULT '',
  visit_created_at       TIMESTAMPTZ,
  updated_at_raw         TEXT NOT NULL DEFAULT '',
  visit_updated_at       TIMESTAMPTZ,
  follow_up_date_raw     TEXT NOT NULL DEFAULT '',
  follow_up_date         DATE,
  sheet_row              INTEGER NOT NULL UNIQUE,
  source_sheet           TEXT,
  source_row             INTEGER,
  imported_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visits_visit_id_idx ON visits (visit_id);
CREATE INDEX IF NOT EXISTS visits_account_name_idx ON visits (lower(btrim(account_name)));
CREATE INDEX IF NOT EXISTS visits_date_idx ON visits (visit_date);

-- Who changed a visit, when, and what (written by the Visit page).
CREATE TABLE IF NOT EXISTS visit_edit_log (
  id             TEXT PRIMARY KEY,
  legacy_key     TEXT NOT NULL UNIQUE,
  visit_id       TEXT NOT NULL DEFAULT '',
  edited_by      TEXT NOT NULL DEFAULT '',
  edited_at_raw  TEXT NOT NULL DEFAULT '',
  edited_at      TIMESTAMPTZ,
  change_summary TEXT NOT NULL DEFAULT '',
  sheet_row      INTEGER NOT NULL,
  source_sheet   TEXT,
  source_row     INTEGER,
  imported_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visit_edit_log_visit_idx ON visit_edit_log (visit_id);
