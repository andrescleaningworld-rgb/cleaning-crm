-- 039: Supplies arrived, per item: back orders and extra (lib/pg/shelves.ts).
--
-- The crew confirms what came, item by item. When less came, the rest stays
-- on its way as a back order: a new supply_deliveries row with back_of set
-- to the delivery it is the rest of, waiting for the crew like any other.
-- The office can cancel a back-ordered item ("Put back on our shelf" or
-- "Lost / never coming"); a back order with every item cancelled is closed.
-- When more came, the extra goes on the site's shelf and is flagged, the
-- same way as short.
--
-- Only adds: two columns with defaults, two nullable columns and one move
-- kind. The code from before this migration keeps working against it.

-- 1. The rest of a delivery that came short.
--    Its source is the order's; its source_ref is the order's ref plus
--    "#back<the delivery it is the rest of>", so the unique index on
--    (source, source_ref) still holds and stays the order's own.
ALTER TABLE supply_deliveries ADD COLUMN IF NOT EXISTS back_of BIGINT REFERENCES supply_deliveries (id);

-- 2. More came than was ordered (short already has its column).
ALTER TABLE supply_deliveries ADD COLUMN IF NOT EXISTS extra BOOLEAN NOT NULL DEFAULT false;

-- 3. Back-ordered items the office cancelled: [{ supplyId, name, unit, qty, choice, by, at }],
--    choice "shelf" (put back on our shelf) or "lost". cancelled_at is set when
--    nothing is left on the back order.
ALTER TABLE supply_deliveries ADD COLUMN IF NOT EXISTS cancelled JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE supply_deliveries ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 4. A move kind for "Lost / never coming". "Put back on our shelf" is a
--    'send' with a plus quantity: the send undone.
ALTER TABLE supply_moves DROP CONSTRAINT IF EXISTS supply_moves_kind_check;
ALTER TABLE supply_moves ADD CONSTRAINT supply_moves_kind_check CHECK (kind IN ('take', 'return', 'pick', 'receive', 'count', 'set', 'send', 'arrive', 'empty', 'lost'));
