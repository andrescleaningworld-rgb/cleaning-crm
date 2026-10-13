-- Crew Link supply catalog: a type and a product code for each item.
-- Postgres only. It only adds two columns: nothing is removed and no
-- existing row's values change. Idempotent. Never edit after applying.
--
--   category   the type the item belongs to ("Toilet paper", "Hand soap"...),
--              so staff can group the catalog. '' = no type yet.
--   sku        our product code for the item. Staff side only: it is never
--              sent to a crew.
--
-- Orders and order lines are not touched: they keep pointing at the same
-- item rows.
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS sku      TEXT NOT NULL DEFAULT '';
