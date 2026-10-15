-- 041: "🗑 Delete order" on Supply Orders (lib/pg/shelves.ts deleteOrder).
--
-- A soft delete: the order's rows stay, marked deleted, with who did it and
-- why (Duplicate, Test, Old / already handled, Entered by mistake, or Other
-- with a note). Supply Orders and the Pin Board leave deleted orders out. An
-- order that already moved stock cannot be deleted.
--
-- Only adds: three columns on each order table, empty by default. The code
-- from before this migration keeps working against it.

-- Sub-portal (and manager) orders: every line of the order is marked.
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS deleted_by TEXT NOT NULL DEFAULT '';
ALTER TABLE sub_supply_orders ADD COLUMN IF NOT EXISTS deleted_reason TEXT NOT NULL DEFAULT '';

-- Crew Link orders.
ALTER TABLE supply_orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE supply_orders ADD COLUMN IF NOT EXISTS deleted_by TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_orders ADD COLUMN IF NOT EXISTS deleted_reason TEXT NOT NULL DEFAULT '';
