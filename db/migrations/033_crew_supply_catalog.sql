-- Crew Link supplies: the catalog, a list per account, and editing an order
-- a crew already sent. Postgres only. It only adds columns and tables: no
-- column or table is removed and no existing row is rewritten. Idempotent.
-- Never edit after applying.
--
-- The catalog is supply_items itself (the Crew Link / Team Hub "Order
-- supplies" list, made by scripts/setup-team-hub-db.js). Every order line
-- already points at it, so nothing is moved. "Remove" stays the existing
-- active switch: an item is hidden, never deleted, and past orders keep it.

-- 1. The catalog fields.
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS brand        TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS product_line TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS photo_url    TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS updated_by   TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS updated_at   TIMESTAMPTZ;

-- 2. The items picked for one account's Crew Link. An account with no rows
--    here keeps seeing every active item, as before.
CREATE TABLE IF NOT EXISTS crew_link_account_supplies (
  account_id TEXT        NOT NULL,
  item_id    INTEGER     NOT NULL REFERENCES supply_items(id),
  added_by   TEXT        NOT NULL DEFAULT '',
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item_id)
);

-- 3. Editing an order after it was sent. original_request is the order as
--    the crew sent it, saved at the first edit and never changed again.
--    An order nobody edited keeps all three empty, so it looks as it did.
ALTER TABLE supply_orders ADD COLUMN IF NOT EXISTS edited_by        TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_orders ADD COLUMN IF NOT EXISTS edited_at        TIMESTAMPTZ;
ALTER TABLE supply_orders ADD COLUMN IF NOT EXISTS original_request JSONB;

--    One row per edit: who, when and what changed.
CREATE TABLE IF NOT EXISTS supply_order_edits (
  id        BIGSERIAL   PRIMARY KEY,
  order_id  INTEGER     NOT NULL REFERENCES supply_orders(id) ON DELETE CASCADE,
  edited_by TEXT        NOT NULL DEFAULT '',
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changes   JSONB       NOT NULL DEFAULT '[]'::jsonb
);

CREATE INDEX IF NOT EXISTS supply_order_edits_order_idx ON supply_order_edits (order_id, edited_at);
