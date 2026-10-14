-- Crew Link supply catalog: the default list. Postgres only. It only adds
-- one column and fills it in once: nothing is removed. Never edit after
-- applying.
--
--   in_default_list   true = a crew at an account with NO list of its own
--                     can order this item. false = only the accounts it has
--                     been picked for see it.
--
-- Before this, an account with no list saw every active item, so every
-- product added to the catalog showed up on those crews' screens. Now they
-- see only the active items on the default list.
--
-- Day one changes nothing for any crew: every item that is active when this
-- runs goes on the default list, and that is exactly what those crews see
-- today. Items that are removed (hidden) stay off it, and so does every item
-- added later, until staff switch it on in Supplies -> Catalog.
--
-- Orders and order lines are not touched.
ALTER TABLE supply_items ADD COLUMN IF NOT EXISTS in_default_list BOOLEAN NOT NULL DEFAULT false;

UPDATE supply_items SET in_default_list = true WHERE active;
