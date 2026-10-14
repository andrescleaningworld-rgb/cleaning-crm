-- One supply list, and simple stock (two shelves). Postgres only. Idempotent.
-- Never edit after applying.
--
-- ONE LIST. The Supplies page's products (sub_supplies) are the only list.
-- Crew Link and Team Hub orders keep pointing at supply_items, as they always
-- have: each Supplies product gets one supply_items row, its "Crew Link face"
-- (the name crews read, brand, on the default list). Order lines and picks
-- keep their rows; nothing is moved.
--
--   supply_items.sub_supply_id   the Supplies product this crew item is.
--                                NULL = an item that is not a Supplies
--                                product (the 21 generic catalog items).
--   sub_supply_orders.supply_id  the Supplies product a sub-portal order line
--                                is for (by ID, not by name). Old lines are
--                                filled in where the name matches exactly one
--                                product; the rest stay by name.
--
-- The generic catalog items are taken out of every list: off the default
-- list, hidden, and their account picks removed. Their rows stay only so past
-- orders still show their names. The picks are written to
-- supply_retired_picks first, so it is known which accounts had them.
--
-- TWO SHELVES.
--   office shelf   sub_supplies.shelf_count (migration 027), as before.
--   site shelf     site_shelf: one count per account and product.
--   deliveries     supply_deliveries: what was sent to a site (office) and
--                  what arrived (crew), with what was short.
--   moves          supply_moves keeps the history; three new kinds:
--                  send (office shelf -> a site), arrive (onto a site shelf),
--                  empty (a case used up at the site).
--
-- Nothing is deleted from any existing table except the generic items'
-- account picks (kept in supply_retired_picks). No existing value changes
-- except: generic items hidden and off the default list; links filled in.

-- 1. The Crew Link face of each Supplies product.
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS sub_supply_id BIGINT REFERENCES sub_supplies (id);
CREATE UNIQUE INDEX IF NOT EXISTS supply_items_sub_supply_idx ON supply_items (sub_supply_id) WHERE sub_supply_id IS NOT NULL;

--    Real products already copied into the crew catalog (practice database:
--    scripts/migrate/copy-supplies-to-catalog.mjs) carry the product's code in
--    sku: link each to its product, one crew item per product.
UPDATE supply_items i
SET sub_supply_id = m.supply_id
FROM (
  SELECT DISTINCT ON (s.id) s.id AS supply_id, c.id AS item_id
  FROM supply_items c
  JOIN sub_supplies s ON lower(btrim(s.supply_item)) = lower(btrim(c.sku))
  WHERE btrim(c.sku) <> '' AND c.sub_supply_id IS NULL
  ORDER BY s.id, c.id
) m
WHERE i.id = m.item_id
  AND NOT EXISTS (SELECT 1 FROM supply_items x WHERE x.sub_supply_id = m.supply_id);

-- 2. The generic catalog items leave every list. Their picks are recorded first.
CREATE TABLE IF NOT EXISTS supply_retired_picks (
  account_id TEXT        NOT NULL,
  item_id    INTEGER     NOT NULL,
  item_name  TEXT        NOT NULL DEFAULT '',
  retired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, item_id)
);
INSERT INTO supply_retired_picks (account_id, item_id, item_name)
SELECT p.account_id, p.item_id, i.name
FROM crew_link_account_supplies p JOIN supply_items i ON i.id = p.item_id
WHERE i.sub_supply_id IS NULL
ON CONFLICT (account_id, item_id) DO NOTHING;
DELETE FROM crew_link_account_supplies p USING supply_items i WHERE i.id = p.item_id AND i.sub_supply_id IS NULL;
UPDATE supply_items SET active = false, in_default_list = false WHERE sub_supply_id IS NULL AND (active OR in_default_list);

-- 3. Sub-portal order lines by product ID.
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS supply_id BIGINT REFERENCES sub_supplies (id);
UPDATE sub_supply_orders o
SET supply_id = s.id
FROM sub_supplies s
WHERE o.supply_id IS NULL
  AND btrim(o.supply_item) <> ''
  AND lower(btrim(o.supply_item)) = lower(btrim(s.supply_item))
  AND (SELECT count(*) FROM sub_supplies d WHERE lower(btrim(d.supply_item)) = lower(btrim(o.supply_item))) = 1;

-- 4. The site shelf: what is at the customer, per product. Never below 0.
CREATE TABLE IF NOT EXISTS site_shelf (
  account_id   TEXT        NOT NULL,
  supply_id    BIGINT      NOT NULL REFERENCES sub_supplies (id),
  account_name TEXT        NOT NULL DEFAULT '',
  qty          INTEGER     NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_by   TEXT        NOT NULL DEFAULT '',
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, supply_id)
);

-- 5. Deliveries: sent by the office, confirmed by the crew.
--   source      crew-order (supply_orders.id), sub-order (the order's group),
--               office (sent with no order)
--   lines       [{ supplyId, name, unit, qty }] as sent or ordered
--   arrived     [{ supplyId, name, unit, qty, got }] as the crew confirmed
--   short       true when anything arrived short or missing
CREATE TABLE IF NOT EXISTS supply_deliveries (
  id           BIGSERIAL   PRIMARY KEY,
  account_id   TEXT        NOT NULL,
  account_name TEXT        NOT NULL DEFAULT '',
  source       TEXT        NOT NULL CHECK (source IN ('crew-order', 'sub-order', 'office')),
  source_ref   TEXT        NOT NULL DEFAULT '',
  lines        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  sent_by      TEXT        NOT NULL DEFAULT '',
  sent_at      TIMESTAMPTZ,
  arrived      JSONB,
  arrived_by   TEXT        NOT NULL DEFAULT '',
  arrived_at   TIMESTAMPTZ,
  short        BOOLEAN     NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS supply_deliveries_source_idx ON supply_deliveries (source, source_ref) WHERE source <> 'office';
CREATE INDEX IF NOT EXISTS supply_deliveries_waiting_idx ON supply_deliveries (account_id) WHERE arrived_at IS NULL;

-- 6. The move kinds of the two shelves.
ALTER TABLE supply_moves DROP CONSTRAINT IF EXISTS supply_moves_kind_check;
ALTER TABLE supply_moves ADD CONSTRAINT supply_moves_kind_check CHECK (kind IN ('take', 'return', 'pick', 'receive', 'count', 'set', 'send', 'arrive', 'empty'));
