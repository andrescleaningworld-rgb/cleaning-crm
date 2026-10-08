-- Area 5 – Equipment: EquipmentCategories, Equipment, EquipmentCheckouts,
-- EquipmentRepairs, EquipmentParts. Idempotent. Never edit after applying.
--
-- Same conventions as 002_catalogs.sql (legacy_key, source_sheet, source_row,
-- *_raw next to typed columns). One addition: sheet_row.
--
--   sheet_row  the row's position, as the app sees it. Imported rows keep
--              their sheet row number; rows created here get the next number
--              (where Sheets would have appended them). The app addresses a
--              checkout by this number when equipment is returned, and "the
--              open checkout" is the one with the highest number, so it has
--              to exist for rows created here too. Rows read in this order.
--
-- Vehicles and the equipment-check reports are already in Postgres (their own
-- tables, lib/vehiclesDb.ts and lib/equipmentCheckDb.ts) and are not touched.

-- Deactivating a category (Active = No) never deletes it.
CREATE TABLE IF NOT EXISTS equipment_categories (
  id           TEXT PRIMARY KEY,
  legacy_key   TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  active_raw   TEXT NOT NULL DEFAULT '',
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  sheet_row    INTEGER NOT NULL,
  source_sheet TEXT,
  source_row   INTEGER,
  imported_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- category_id and current_holder_id are not foreign keys: the sheet lets them
-- point at nothing, and the screens cope with that today.
-- item_created_at_raw is the sheet's CreatedAt column (created_at is this
-- table's own bookkeeping column).
CREATE TABLE IF NOT EXISTS equipment (
  id                           TEXT PRIMARY KEY,
  legacy_key                   TEXT NOT NULL UNIQUE,
  name                         TEXT NOT NULL DEFAULT '',
  category_id                  TEXT NOT NULL DEFAULT '',
  serial_number                TEXT NOT NULL DEFAULT '',
  purchase_date_raw            TEXT NOT NULL DEFAULT '',
  purchase_date                DATE,
  purchase_cost_raw            TEXT NOT NULL DEFAULT '',
  purchase_cost                NUMERIC,
  status_raw                   TEXT NOT NULL DEFAULT '',
  current_holder_type          TEXT NOT NULL DEFAULT '',
  current_holder_id            TEXT NOT NULL DEFAULT '',
  current_holder_name          TEXT NOT NULL DEFAULT '',
  condition_notes              TEXT NOT NULL DEFAULT '',
  photo_url                    TEXT NOT NULL DEFAULT '',
  item_created_at_raw          TEXT NOT NULL DEFAULT '',
  item_created_at              TIMESTAMPTZ,
  checked_out_at_raw           TEXT NOT NULL DEFAULT '',
  checked_out_at               TIMESTAMPTZ,
  expected_return_at_raw       TEXT NOT NULL DEFAULT '',
  expected_return_at           TIMESTAMPTZ,
  needs_maintenance_review_raw TEXT NOT NULL DEFAULT '',
  sheet_row                    INTEGER NOT NULL,
  source_sheet                 TEXT,
  source_row                   INTEGER,
  imported_at                  TIMESTAMPTZ,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS equipment_checkouts (
  id                       TEXT PRIMARY KEY,
  legacy_key               TEXT NOT NULL UNIQUE,
  equipment_id             TEXT NOT NULL DEFAULT '',
  holder_type              TEXT NOT NULL DEFAULT '',
  holder_id                TEXT NOT NULL DEFAULT '',
  holder_name              TEXT NOT NULL DEFAULT '',
  account_id               TEXT NOT NULL DEFAULT '',
  checked_out_at_raw       TEXT NOT NULL DEFAULT '',
  checked_out_at           TIMESTAMPTZ,
  expected_return_at_raw   TEXT NOT NULL DEFAULT '',
  expected_return_at       TIMESTAMPTZ,
  returned_at_raw          TEXT NOT NULL DEFAULT '',
  returned_at              TIMESTAMPTZ,
  condition_at_checkout    TEXT NOT NULL DEFAULT '',
  condition_at_return      TEXT NOT NULL DEFAULT '',
  signed_out_by_staff_id   TEXT NOT NULL DEFAULT '',
  signed_out_by_staff_name TEXT NOT NULL DEFAULT '',
  signed_in_by_staff_id    TEXT NOT NULL DEFAULT '',
  signed_in_by_staff_name  TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  work_order_number        TEXT NOT NULL DEFAULT '',
  sheet_row                INTEGER NOT NULL,
  source_sheet             TEXT,
  source_row               INTEGER,
  imported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_checkouts_equipment_idx ON equipment_checkouts (equipment_id);

CREATE TABLE IF NOT EXISTS equipment_repairs (
  id               TEXT PRIMARY KEY,
  legacy_key       TEXT NOT NULL UNIQUE,
  equipment_id     TEXT NOT NULL DEFAULT '',
  started_at_raw   TEXT NOT NULL DEFAULT '',
  started_at       TIMESTAMPTZ,
  completed_at_raw TEXT NOT NULL DEFAULT '',
  completed_at     TIMESTAMPTZ,
  description      TEXT NOT NULL DEFAULT '',
  cost_raw         TEXT NOT NULL DEFAULT '',
  cost             NUMERIC,
  performed_by     TEXT NOT NULL DEFAULT '',
  parts_used       TEXT NOT NULL DEFAULT '',
  status_raw       TEXT NOT NULL DEFAULT '',
  sheet_row        INTEGER NOT NULL,
  source_sheet     TEXT,
  source_row       INTEGER,
  imported_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS equipment_repairs_equipment_idx ON equipment_repairs (equipment_id);

-- compatible_equipment_id blank or "General" = not tied to one item.
CREATE TABLE IF NOT EXISTS equipment_parts (
  id                      TEXT PRIMARY KEY,
  legacy_key              TEXT NOT NULL UNIQUE,
  part_name               TEXT NOT NULL DEFAULT '',
  compatible_equipment_id TEXT NOT NULL DEFAULT '',
  supplier                TEXT NOT NULL DEFAULT '',
  unit_cost_raw           TEXT NOT NULL DEFAULT '',
  unit_cost               NUMERIC,
  stock_qty_raw           TEXT NOT NULL DEFAULT '',
  stock_qty               NUMERIC,
  low_stock_threshold_raw TEXT NOT NULL DEFAULT '',
  low_stock_threshold     NUMERIC,
  sheet_row               INTEGER NOT NULL,
  source_sheet            TEXT,
  source_row              INTEGER,
  imported_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
