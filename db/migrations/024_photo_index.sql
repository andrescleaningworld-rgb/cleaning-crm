-- photo_index: one row per photo anywhere in the app, so the Photos page can
-- show them all in one place by account, issue and date.
--
-- It is an index only. The files stay where they are (Blob storage, Google
-- Drive) and the tables that own them are not changed. Rows are copied in
-- from every source by lib/pg/photo-index.ts; nothing here is imported from
-- or written to Google Sheets.
--
--   source_key   which photo this is, once and only once
--                ("sub-site:12", "extra-job:4", "drive:PH-0003", ...)
--   store        where the file is: 'blob' or 'drive'
--   kind         Complaint | Crew problem | Sub photo | Extra job | Estimate
--                | Equipment | Visit
--   moment       'before' / 'after' for a before-and-after photo, else ''
--   linked_*     the thing the photo belongs to, and where to open it
--   is_image     false for a file that is not a picture (an estimate PDF)
CREATE TABLE IF NOT EXISTS photo_index (
  id           BIGSERIAL PRIMARY KEY,
  source_key   TEXT NOT NULL UNIQUE,
  store        TEXT NOT NULL DEFAULT 'blob' CHECK (store IN ('blob', 'drive')),
  url          TEXT NOT NULL,
  account_id   TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  kind         TEXT NOT NULL CHECK (kind IN ('Complaint', 'Crew problem', 'Sub photo', 'Extra job', 'Estimate', 'Equipment', 'Visit')),
  moment       TEXT NOT NULL DEFAULT '' CHECK (moment IN ('', 'before', 'after')),
  linked_type  TEXT NOT NULL DEFAULT '',
  linked_id    TEXT NOT NULL DEFAULT '',
  linked_label TEXT NOT NULL DEFAULT '',
  linked_href  TEXT NOT NULL DEFAULT '',
  taken_by     TEXT NOT NULL DEFAULT '',
  taken_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_image     BOOLEAN NOT NULL DEFAULT true,
  indexed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS photo_index_taken_idx ON photo_index (taken_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS photo_index_account_idx ON photo_index (lower(account_name), taken_at DESC);
CREATE INDEX IF NOT EXISTS photo_index_kind_idx ON photo_index (kind, taken_at DESC);
