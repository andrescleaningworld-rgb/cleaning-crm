-- Supply control: the supply shelf, counted and charged, like Equipment.
-- Everything here is added next to what exists; no column or row of the
-- current supplies or supply orders is changed or removed.
--
-- sub_supplies gets what the shelf needs to know about each item.
--   shelf_count  how many are on the shelf right now (NULL = never counted)
--   min_level    at or below this, the item is on the red Reorder list
ALTER TABLE sub_supplies ADD COLUMN IF NOT EXISTS photo_url      TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supplies ADD COLUMN IF NOT EXISTS unit_cost      NUMERIC(10, 2);
ALTER TABLE sub_supplies ADD COLUMN IF NOT EXISTS vendor         TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supplies ADD COLUMN IF NOT EXISTS shelf_location TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supplies ADD COLUMN IF NOT EXISTS min_level      INTEGER;
ALTER TABLE sub_supplies ADD COLUMN IF NOT EXISTS shelf_count    INTEGER;

-- The numbers that were typed in the old sheet columns, where they are numbers.
UPDATE sub_supplies SET shelf_count = current_stock_raw::int WHERE shelf_count IS NULL AND btrim(current_stock_raw) ~ '^[0-9]{1,6}$';
UPDATE sub_supplies SET min_level = minimum_stock_raw::int WHERE min_level IS NULL AND btrim(minimum_stock_raw) ~ '^[0-9]{1,6}$';

-- supply_moves: every time the shelf count changes, who did it and when.
--   qty       negative = left the shelf, positive = came back or came in
--   kind      take      someone took it at the Supply Check tablet
--             return    someone brought it back
--             pick      picked from the shelf for an order
--             receive   bought items put on the shelf
--             count     the weekly count found a different number
--             set       the office typed a new shelf count
--   account_* where it went: a site, or account_id '' with "Office use"
--   unit_cost the item's cost at that moment, so old months never change
CREATE TABLE IF NOT EXISTS supply_moves (
  id           BIGSERIAL PRIMARY KEY,
  supply_id    BIGINT NOT NULL REFERENCES sub_supplies (id),
  item_name    TEXT NOT NULL DEFAULT '',
  qty          INTEGER NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('take', 'return', 'pick', 'receive', 'count', 'set')),
  account_id   TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  unit_cost    NUMERIC(10, 2),
  staff_id     TEXT NOT NULL DEFAULT '',
  staff_name   TEXT NOT NULL DEFAULT '',
  order_id     TEXT NOT NULL DEFAULT '',
  note         TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supply_moves_when_idx ON supply_moves (created_at DESC);
CREATE INDEX IF NOT EXISTS supply_moves_account_idx ON supply_moves (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS supply_moves_supply_idx ON supply_moves (supply_id, created_at DESC);

-- One row of settings. Orders worth this much or less approve themselves.
CREATE TABLE IF NOT EXISTS supply_control_settings (
  id                  BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  auto_approve_amount NUMERIC(10, 2) NOT NULL DEFAULT 50,
  updated_by          TEXT NOT NULL DEFAULT '',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO supply_control_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- Per account: are supplies part of the price, or billed to the customer?
-- No row = included.
CREATE TABLE IF NOT EXISTS supply_account_modes (
  account_id   TEXT PRIMARY KEY,
  account_name TEXT NOT NULL DEFAULT '',
  mode         TEXT NOT NULL CHECK (mode IN ('included', 'billed')),
  updated_by   TEXT NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- "Mark invoiced": one row per billed account and month ('2026-10').
CREATE TABLE IF NOT EXISTS supply_invoiced (
  account_id  TEXT NOT NULL,
  month       TEXT NOT NULL CHECK (month ~ '^[0-9]{4}-[0-9]{2}$'),
  amount      NUMERIC(10, 2) NOT NULL DEFAULT 0,
  invoiced_by TEXT NOT NULL DEFAULT '',
  invoiced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, month)
);

-- The weekly count: the five items the tablet asks about each week, and
-- what was counted. expected = the shelf count at that moment.
CREATE TABLE IF NOT EXISTS supply_count_asks (
  week_start DATE NOT NULL,
  supply_id  BIGINT NOT NULL REFERENCES sub_supplies (id),
  expected   INTEGER,
  counted    INTEGER,
  staff_name TEXT NOT NULL DEFAULT '',
  counted_at TIMESTAMPTZ,
  PRIMARY KEY (week_start, supply_id)
);

-- Order lines: from the shelf, or bought and shipped direct, and the step.
--   line_source  'shelf' | 'buy' ('' on orders made before this)
--   step         ordered -> approved -> picked | bought -> delivered
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS line_source TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS step        TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS unit_cost   NUMERIC(10, 2);
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS ordered_by  TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS step_by     TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS step_at     TIMESTAMPTZ;
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS po_number   TEXT NOT NULL DEFAULT '';
