-- Area 3 – Subcontractors and the Subcontractor Activity Log (the Sub Center
-- log; it is NOT the staff audit log in activity_log and the two are never
-- merged). Idempotent. Never edit after applying.

-- In Sheets a subcontractor has no stable id: column A is a formula that
-- numbers rows (SUB-001 = row 2), and the app's id is "SUB-ROW-<row>". Both
-- change for everyone below when a row is inserted or deleted.
--
--   id             permanent from here on. Imported subs keep the column A
--                  number they had at first import; new ones get the next
--                  free SUB-NNN. Never reused, never renumbered.
--   legacy_row_id  "SUB-ROW-<row>": what the app, DocumentSends and other
--                  tabs still call this sub. Updated by the import if the
--                  row moves in Sheets.
--   fingerprint    contact + company + email, normalized. Lets a re-import
--                  recognise a sub whose row moved.
CREATE TABLE IF NOT EXISTS subcontractors (
  id                       TEXT PRIMARY KEY,
  legacy_key               TEXT NOT NULL UNIQUE,
  legacy_row_id            TEXT UNIQUE,
  display_id_raw           TEXT NOT NULL DEFAULT '',
  fingerprint              TEXT NOT NULL DEFAULT '',
  contact_name             TEXT NOT NULL DEFAULT '',
  company_name             TEXT NOT NULL DEFAULT '',
  address                  TEXT NOT NULL DEFAULT '',
  phone                    TEXT NOT NULL DEFAULT '',
  email                    TEXT NOT NULL DEFAULT '',
  areas_serviced           TEXT NOT NULL DEFAULT '',
  services_provided        TEXT NOT NULL DEFAULT '',
  employee_capacity        TEXT NOT NULL DEFAULT '',
  insurance_document_name  TEXT NOT NULL DEFAULT '',
  insurance_expiration     DATE,
  insurance_expiration_raw TEXT NOT NULL DEFAULT '',
  -- Sheets has Active / Inactive / Paused and many blanks; blank is kept blank.
  status                   TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  created_at_raw           TEXT NOT NULL DEFAULT '',
  updated_at_raw           TEXT NOT NULL DEFAULT '',
  -- Legacy duplicate columns at the end of the tab (a second ID, a second
  -- Phone, a second Insurance Expiration). The app never reads them; kept so
  -- nothing typed there is lost.
  extra_id_raw             TEXT NOT NULL DEFAULT '',
  extra_phone_raw          TEXT NOT NULL DEFAULT '',
  extra_insurance_raw      TEXT NOT NULL DEFAULT '',
  source_sheet             TEXT,
  source_row               INTEGER,
  imported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Not UNIQUE: two rows share an email today (see migration_issues). Made
-- unique in a later "tighten" migration once Andres has decided.
CREATE INDEX IF NOT EXISTS subcontractors_email_idx ON subcontractors (lower(email)) WHERE email <> '';

-- Names other tabs use for a sub (Accounts "Subcontractor" is free text).
-- One row per name that points at exactly one sub. A name that fits two
-- subs is never stored here; it becomes a question in migration_issues.
--   source: 'contact' | 'company' | 'override'
CREATE TABLE IF NOT EXISTS sub_name_aliases (
  alias            TEXT PRIMARY KEY,
  subcontractor_id TEXT NOT NULL REFERENCES subcontractors (id) ON DELETE CASCADE,
  source           TEXT NOT NULL CHECK (source IN ('contact', 'company', 'override')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- What subcontractors did in their portal (Login, Viewed Schedule, …).
-- logged_at is the wall-clock time the sheet shows (no time zone in the
-- source); logged_at_raw is the exact text.
CREATE TABLE IF NOT EXISTS sub_activity_log (
  id                   BIGSERIAL PRIMARY KEY,
  legacy_key           TEXT NOT NULL UNIQUE,
  logged_at            TIMESTAMP,
  logged_at_raw        TEXT NOT NULL DEFAULT '',
  subcontractor_id     TEXT REFERENCES subcontractors (id) ON DELETE SET NULL,
  subcontractor_email  TEXT NOT NULL DEFAULT '',
  subcontractor_name   TEXT NOT NULL DEFAULT '',
  action_type          TEXT NOT NULL DEFAULT '',
  details              TEXT NOT NULL DEFAULT '',
  source_sheet         TEXT,
  source_row           INTEGER,
  imported_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_activity_log_time_idx ON sub_activity_log (logged_at DESC);
CREATE INDEX IF NOT EXISTS sub_activity_log_sub_idx ON sub_activity_log (subcontractor_id);
