-- Area 12 – Supplies: Supplies and Supply Orders (MAIN), until now read and
-- written only by Apps Script. Idempotent. Never edit after applying.
--
-- Same conventions as the earlier areas (legacy_key, source_sheet,
-- source_row, *_raw next to typed columns, sheet_row).
--
-- These are NOT the Team Hub tables. supply_items / supply_orders /
-- supply_order_lines already exist for Team Hub and Crew Link (their own
-- catalog, numeric ids, crews and sites) and are left exactly as they are.
-- The office catalog that subcontractors order from gets its own two tables.
--
-- sub_supplies: one row per row of the Supplies tab.
--   sheet_row   unique. The app's item id is "SUP-<sheet_row>", and edits
--               address the item by that row number.
--   status / active_raw   both kept as typed. The app shows status when it
--               is filled, else works it out from active, else "Active".
CREATE TABLE IF NOT EXISTS sub_supplies (
  id                     BIGSERIAL PRIMARY KEY,
  legacy_key             TEXT NOT NULL UNIQUE,
  supply_item            TEXT NOT NULL DEFAULT '',
  category               TEXT NOT NULL DEFAULT '',
  description            TEXT NOT NULL DEFAULT '',
  unit                   TEXT NOT NULL DEFAULT '',
  status                 TEXT NOT NULL DEFAULT '',
  notes                  TEXT NOT NULL DEFAULT '',
  active_raw             TEXT NOT NULL DEFAULT '',
  current_stock_raw      TEXT NOT NULL DEFAULT '',
  minimum_stock_raw      TEXT NOT NULL DEFAULT '',
  last_updated_raw       TEXT NOT NULL DEFAULT '',
  updated_by             TEXT NOT NULL DEFAULT '',
  low_stock_email_to     TEXT NOT NULL DEFAULT '',
  low_stock_email_status TEXT NOT NULL DEFAULT '',
  sheet_row              INTEGER NOT NULL UNIQUE,
  source_sheet           TEXT,
  source_row             INTEGER,
  imported_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sub_supply_orders: one row per ordered item (an order of three items is
-- three rows, as in the sheet).
--   order_id        "SUPORD-<14 digits>". Text, not the key.
--   order_group_id  what ties the rows of one order together. The sheet has
--                   no column for it, so imported rows have it empty.
--   category / description   sent by the portal, no column in the sheet:
--                   empty on imported rows.
--   quantity_raw    free text in the sheet ("8", "8 boxes").
--   subcontractor_id / account_ref   links worked out by exact match only.
CREATE TABLE IF NOT EXISTS sub_supply_orders (
  id                  BIGSERIAL PRIMARY KEY,
  legacy_key          TEXT NOT NULL UNIQUE,
  timestamp_raw       TEXT NOT NULL DEFAULT '',
  ordered_on          DATE,
  order_id            TEXT NOT NULL DEFAULT '',
  order_group_id      TEXT NOT NULL DEFAULT '',
  subcontractor       TEXT NOT NULL DEFAULT '',
  subcontractor_email TEXT NOT NULL DEFAULT '',
  subcontractor_id    TEXT,
  account_name        TEXT NOT NULL DEFAULT '',
  account_id_raw      TEXT NOT NULL DEFAULT '',
  account_ref         TEXT,
  supply_item         TEXT NOT NULL DEFAULT '',
  category            TEXT NOT NULL DEFAULT '',
  description         TEXT NOT NULL DEFAULT '',
  quantity_raw        TEXT NOT NULL DEFAULT '',
  unit                TEXT NOT NULL DEFAULT '',
  delivery_mode       TEXT NOT NULL DEFAULT '',
  notes               TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT '',
  email_sent_to       TEXT NOT NULL DEFAULT '',
  email_status        TEXT NOT NULL DEFAULT '',
  sheet_row           INTEGER NOT NULL UNIQUE,
  source_sheet        TEXT,
  source_row          INTEGER,
  imported_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_supply_orders_order_id_idx ON sub_supply_orders (order_id);
CREATE INDEX IF NOT EXISTS sub_supply_orders_status_idx ON sub_supply_orders (lower(btrim(status)));
