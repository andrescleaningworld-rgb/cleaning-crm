-- Area 8 – Complaints (MAIN). Idempotent. Never edit after applying.
--
-- Same conventions as the earlier areas (legacy_key, source_sheet,
-- source_row, *_raw next to typed columns, sheet_row).
--
--   complaint_id     column A, "COMP-<14 digits>". Text, not the key.
--   account_id_raw   column B: whatever the form sent as the account's ID
--                    (the account's own id for most rows).
--   account_ref      the real link, worked out at import: accounts.id by
--                    that ID, else by exact account name; NULL otherwise.
--   sheet_row        unique. The app shows it as rowNumber and sends it
--                    back to close a complaint, so it has to exist for rows
--                    created here too (they get the next number).
--   resolution_note  NOT a sheet column. The text typed when a complaint is
--                    closed has nowhere to go in the sheet today; here it
--                    is kept. Nothing reads it yet.
--   resolution_date_raw, created_at_raw, last_follow_up_raw
--                    columns L, N and P: empty on every row today, kept so
--                    nothing is lost if that changes.
CREATE TABLE IF NOT EXISTS complaints (
  id                    BIGSERIAL PRIMARY KEY,
  legacy_key            TEXT NOT NULL UNIQUE,
  complaint_id          TEXT NOT NULL DEFAULT '',
  account_id_raw        TEXT NOT NULL DEFAULT '',
  account_name          TEXT NOT NULL DEFAULT '',
  account_ref           TEXT,
  complaint_date_raw    TEXT NOT NULL DEFAULT '',
  complaint_date        DATE,
  issue                 TEXT NOT NULL DEFAULT '',
  priority              TEXT NOT NULL DEFAULT '',
  complaint_validity    TEXT NOT NULL DEFAULT '',
  status                TEXT NOT NULL DEFAULT '',
  reported_by           TEXT NOT NULL DEFAULT '',
  assigned_to           TEXT NOT NULL DEFAULT '',
  last_follow_up_date_raw TEXT NOT NULL DEFAULT '',
  last_follow_up_date   DATE,
  resolution_date_raw   TEXT NOT NULL DEFAULT '',
  notes                 TEXT NOT NULL DEFAULT '',
  created_at_raw        TEXT NOT NULL DEFAULT '',
  updated_at_raw        TEXT NOT NULL DEFAULT '',
  complaint_updated_at  TIMESTAMPTZ,
  last_follow_up_raw    TEXT NOT NULL DEFAULT '',
  resolution_note       TEXT NOT NULL DEFAULT '',
  sheet_row             INTEGER NOT NULL UNIQUE,
  source_sheet          TEXT,
  source_row            INTEGER,
  imported_at           TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complaints_complaint_id_idx ON complaints (complaint_id);
CREATE INDEX IF NOT EXISTS complaints_account_idx ON complaints (account_ref);
CREATE INDEX IF NOT EXISTS complaints_status_idx ON complaints (lower(btrim(status)));
