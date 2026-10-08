-- Area 1 – Catalogs & logs: ChangeLog, GeocodeCache, ExtraServices,
-- Documents, DocumentSends. Idempotent. Never edit after applying.
--
-- Conventions for every imported table (plan C.1 step 1):
--   legacy_key    what identifies the row in Sheets (its ID, or a SHA-256 of
--                 the identifying columns when the tab has no ID)
--   source_sheet  MAIN or PORTAL; NULL for rows created in Postgres
--   source_row    sheet row number at import time; NULL for rows created here
--   *_raw         the exact Sheets text next to its typed column, so reads
--                 can return what the app returns today
-- Rows read in sheet order: ORDER BY source_row NULLS LAST, created_at, id.

CREATE TABLE IF NOT EXISTS changelog_entries (
  id             BIGSERIAL PRIMARY KEY,
  legacy_key     TEXT NOT NULL UNIQUE,
  entry_date     DATE,
  entry_date_raw TEXT NOT NULL DEFAULT '',
  version        TEXT NOT NULL DEFAULT '',
  description    TEXT NOT NULL DEFAULT '',
  source_sheet   TEXT,
  source_row     INTEGER,
  imported_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cache key is the exact address string that was geocoded (trimmed only).
CREATE TABLE IF NOT EXISTS geocode_cache (
  address         TEXT PRIMARY KEY,
  legacy_key      TEXT NOT NULL UNIQUE,
  latitude        DOUBLE PRECISION NOT NULL,
  longitude       DOUBLE PRECISION NOT NULL,
  geocoded_at     TIMESTAMPTZ,
  geocoded_at_raw TEXT NOT NULL DEFAULT '',
  source_sheet    TEXT,
  source_row      INTEGER,
  imported_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Specialty services customers can ask for in the portal. Soft delete only
-- (active = false), same as today.
CREATE TABLE IF NOT EXISTS extra_services (
  id           TEXT PRIMARY KEY,
  legacy_key   TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  image_url    TEXT NOT NULL DEFAULT '',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  source_sheet TEXT,
  source_row   INTEGER,
  imported_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company documents (contracts, handbooks, policies). The file itself is in
-- Vercel Blob; file_url points at it. Hard delete, same as today.
CREATE TABLE IF NOT EXISTS documents (
  id              TEXT PRIMARY KEY,
  legacy_key      TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL DEFAULT '',
  category        TEXT NOT NULL DEFAULT '',
  file_name       TEXT NOT NULL DEFAULT '',
  file_url        TEXT NOT NULL DEFAULT '',
  file_size       BIGINT NOT NULL DEFAULT 0,
  uploaded_at     TIMESTAMPTZ,
  uploaded_at_raw TEXT NOT NULL DEFAULT '',
  uploaded_by     TEXT NOT NULL DEFAULT '',
  source_sheet    TEXT,
  source_row      INTEGER,
  imported_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Log of "Send to Subcontractor" emails. document_id is not a foreign key:
-- a document can be deleted while its send history stays. subcontractor_id
-- stays NULL until Area 3 resolves subcontractor_id_raw (a row-position id
-- like SUB-ROW-12) to a permanent subcontractor id.
CREATE TABLE IF NOT EXISTS document_sends (
  id                   TEXT PRIMARY KEY,
  legacy_key           TEXT NOT NULL UNIQUE,
  document_id          TEXT NOT NULL DEFAULT '',
  document_name        TEXT NOT NULL DEFAULT '',
  subcontractor_id     TEXT,
  subcontractor_id_raw TEXT NOT NULL DEFAULT '',
  subcontractor_name   TEXT NOT NULL DEFAULT '',
  sent_by              TEXT NOT NULL DEFAULT '',
  sent_at              TIMESTAMPTZ,
  sent_at_raw          TEXT NOT NULL DEFAULT '',
  note                 TEXT NOT NULL DEFAULT '',
  source_sheet         TEXT,
  source_row           INTEGER,
  imported_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_sends_document_idx ON document_sends (document_id);
