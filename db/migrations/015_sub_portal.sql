-- Area 13 – Sub portal: Sub Portal Issues and Photos (MAIN), until now read
-- and written only by Apps Script. Idempotent. Never edit after applying.
--
-- Same conventions as the earlier areas (legacy_key, source_sheet,
-- source_row, *_raw next to typed columns, sheet_row).
--
-- sub_portal_issues: what a subcontractor reports from the portal ("Report
-- an issue"). Staff see them under Notifications and set status and notes.
--   issue_id        "SUBISSUE-<14 digits>". Text, not the key.
--   photo_count_raw as typed (the sheet shows 0 as an empty cell).
--   subcontractor_id / account_ref   links worked out by exact match only.
CREATE TABLE IF NOT EXISTS sub_portal_issues (
  id                  BIGSERIAL PRIMARY KEY,
  legacy_key          TEXT NOT NULL UNIQUE,
  timestamp_raw       TEXT NOT NULL DEFAULT '',
  reported_on         DATE,
  issue_id            TEXT NOT NULL DEFAULT '',
  subcontractor_email TEXT NOT NULL DEFAULT '',
  subcontractor_name  TEXT NOT NULL DEFAULT '',
  subcontractor_id    TEXT,
  account_id_raw      TEXT NOT NULL DEFAULT '',
  account_name        TEXT NOT NULL DEFAULT '',
  account_ref         TEXT,
  issue_type          TEXT NOT NULL DEFAULT '',
  urgency             TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',
  photo_count_raw     TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  sheet_row           INTEGER NOT NULL UNIQUE,
  source_sheet        TEXT,
  source_row          INTEGER,
  imported_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_portal_issues_issue_id_idx ON sub_portal_issues (issue_id);
CREATE INDEX IF NOT EXISTS sub_portal_issues_status_idx ON sub_portal_issues (lower(btrim(status)));

-- photos: one row per photo Apps Script put into Google Drive (complaint
-- photos, sub portal issue photos). A copy for the record: uploading and
-- listing photos still go through Apps Script, which owns the Drive
-- folders, so this table is not read by the app yet.
--   source_type / source_id   what the photo belongs to ("Complaint" + the
--                             complaint id, "Sub Portal Issue" + the issue id).
CREATE TABLE IF NOT EXISTS photos (
  id            BIGSERIAL PRIMARY KEY,
  legacy_key    TEXT NOT NULL UNIQUE,
  timestamp_raw TEXT NOT NULL DEFAULT '',
  taken_on      DATE,
  photo_id      TEXT NOT NULL DEFAULT '',
  account_id_raw TEXT NOT NULL DEFAULT '',
  account_name  TEXT NOT NULL DEFAULT '',
  account_ref   TEXT,
  source_type   TEXT NOT NULL DEFAULT '',
  source_id     TEXT NOT NULL DEFAULT '',
  uploaded_by   TEXT NOT NULL DEFAULT '',
  user_role     TEXT NOT NULL DEFAULT '',
  file_name     TEXT NOT NULL DEFAULT '',
  drive_file_id TEXT NOT NULL DEFAULT '',
  drive_url     TEXT NOT NULL DEFAULT '',
  folder_url    TEXT NOT NULL DEFAULT '',
  notes         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT '',
  sheet_row     INTEGER NOT NULL UNIQUE,
  source_sheet  TEXT,
  source_row    INTEGER,
  imported_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photos_source_idx ON photos (source_type, source_id);
