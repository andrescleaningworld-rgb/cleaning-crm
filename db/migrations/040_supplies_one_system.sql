-- 040: One supplies system (lib/pg/shelves.ts): one order inbox, "How do we
-- fill it?", warehouse stock that can belong to a customer, site stock the
-- office can add to and correct, and history with its source.
--
-- Only adds: columns with defaults and more move kinds. The code from before
-- this migration keeps working against it.

-- 1. How an approved order is filled. Set on the order's delivery when the
--    office picks it:
--      vendor    the vendor ships to the site; the crew confirms (Supplies arrived)
--      pickup    the sub picks it up at the warehouse; the office taps Picked up
--      deliver   we take it from the warehouse (the tablet) and drive it; the crew confirms
--    '' = a delivery from before this, or one the office sent with no order.
ALTER TABLE supply_deliveries ADD COLUMN IF NOT EXISTS fill TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_deliveries DROP CONSTRAINT IF EXISTS supply_deliveries_fill_check;
ALTER TABLE supply_deliveries ADD CONSTRAINT supply_deliveries_fill_check CHECK (fill IN ('', 'vendor', 'pickup', 'deliver'));

-- 2. Stock bought for one customer and kept at the warehouse until it goes to
--    their site. It sits on that customer's site_shelf row, next to what is at
--    the site (qty). Cleaning World's own warehouse stock stays
--    sub_supplies.shelf_count.
ALTER TABLE site_shelf ADD COLUMN IF NOT EXISTS warehouse_qty INTEGER NOT NULL DEFAULT 0;
ALTER TABLE site_shelf DROP CONSTRAINT IF EXISTS site_shelf_warehouse_qty_check;
ALTER TABLE site_shelf ADD CONSTRAINT site_shelf_warehouse_qty_check CHECK (warehouse_qty >= 0);

-- 3. History: where a move was made, and the in-house job it was for.
--      source        office | tablet | crew-link | sub-portal ('' = before this)
--      extra_job_id  extra_jobs.id when supplies were taken for that job
ALTER TABLE supply_moves ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT '';
ALTER TABLE supply_moves ADD COLUMN IF NOT EXISTS extra_job_id TEXT NOT NULL DEFAULT '';

-- 4. Two more move kinds, both the office on an account's Site stock:
--      site-add   "+ Add delivery": supplies that reached the site with no order
--      site-set   a site count corrected (the reason is the move's note)
ALTER TABLE supply_moves DROP CONSTRAINT IF EXISTS supply_moves_kind_check;
ALTER TABLE supply_moves ADD CONSTRAINT supply_moves_kind_check CHECK (kind IN ('take', 'return', 'pick', 'receive', 'count', 'set', 'send', 'arrive', 'empty', 'lost', 'site-add', 'site-set'));
