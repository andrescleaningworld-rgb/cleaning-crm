-- Area 2 – People: Staff and Managers. Idempotent. Never edit after applying.
-- Staff and Managers stay two separate lists (merging them is a proposal
-- only). See 002_catalogs.sql for the shared column conventions.

-- Staff is the login identity source (manager_accounts.staff_id) and the
-- equipment sign-off list.
CREATE TABLE IF NOT EXISTS staff (
  id           TEXT PRIMARY KEY,
  legacy_key   TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  -- What the app uses: anything that is not Manager / OfficeStaff counts as
  -- InsideStaff (normalizeStaffRole). role_raw keeps the Sheets text.
  role         TEXT NOT NULL DEFAULT 'InsideStaff' CHECK (role IN ('Manager', 'OfficeStaff', 'InsideStaff')),
  role_raw     TEXT NOT NULL DEFAULT '',
  -- Only an explicit "No" means inactive.
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  source_sheet TEXT,
  source_row   INTEGER,
  imported_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Managers: the people accounts are assigned to (To-Do "Assigned To", SMS
-- phone, calendar color). Not a login source.
--
-- row_no is the row's stable position number. The app addresses a manager
-- by "sheetRow" when saving (PATCH /api/admin/managers), so every manager
-- needs one: imported rows keep their sheet row, new rows get max + 1.
--
-- staff_id links a manager to their Staff record. It is only ever set from
-- a migration_overrides answer, never guessed from the name.
CREATE TABLE IF NOT EXISTS managers (
  id                BIGSERIAL PRIMARY KEY,
  legacy_key        TEXT NOT NULL UNIQUE,
  manager_id        TEXT NOT NULL DEFAULT '',
  name              TEXT NOT NULL DEFAULT '',
  email             TEXT NOT NULL DEFAULT '',
  phone             TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT '',
  notes             TEXT NOT NULL DEFAULT '',
  calendar_color_id TEXT NOT NULL DEFAULT '',
  staff_id          TEXT REFERENCES staff (id) ON DELETE SET NULL,
  row_no            INTEGER NOT NULL UNIQUE,
  source_sheet      TEXT,
  source_row        INTEGER,
  imported_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS managers_manager_id_idx ON managers (manager_id) WHERE manager_id <> '';
