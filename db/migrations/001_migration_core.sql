-- Shared bookkeeping for the Sheets → Postgres migration.
-- Idempotent. Never edit this file after it has been applied; add a new one.

-- One row per import / verify / parity run.
CREATE TABLE IF NOT EXISTS migration_runs (
  id          BIGSERIAL PRIMARY KEY,
  area        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('import', 'verify', 'parity')),
  dry_run     BOOLEAN NOT NULL DEFAULT FALSE,
  status      TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'ok', 'failed')),
  summary     JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS migration_runs_area_idx ON migration_runs (area, started_at DESC);

-- Rows the import could not resolve with certainty. Each one is a question
-- for Andres. Imports upsert on (area, table_name, legacy_key, problem), so
-- re-runs never duplicate an issue.
CREATE TABLE IF NOT EXISTS migration_issues (
  id           BIGSERIAL PRIMARY KEY,
  area         TEXT NOT NULL,
  table_name   TEXT NOT NULL,
  legacy_key   TEXT NOT NULL,
  problem      TEXT NOT NULL,
  raw_value    TEXT,
  candidates   JSONB NOT NULL DEFAULT '[]'::jsonb,
  status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'wont_fix')),
  run_id       BIGINT REFERENCES migration_runs (id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (area, table_name, legacy_key, problem)
);

CREATE INDEX IF NOT EXISTS migration_issues_open_idx ON migration_issues (area, status);

-- Andres's answers: "this raw Sheets value means this id". Imports apply
-- these before any matching logic. kind says what is being resolved, e.g.
-- 'subcontractor', 'account', 'manager', 'staff'.
CREATE TABLE IF NOT EXISTS migration_overrides (
  id           BIGSERIAL PRIMARY KEY,
  area         TEXT NOT NULL,
  kind         TEXT NOT NULL,
  legacy_key   TEXT NOT NULL,
  resolved_id  TEXT,
  note         TEXT,
  created_by   TEXT NOT NULL DEFAULT 'andres',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (area, kind, legacy_key)
);
