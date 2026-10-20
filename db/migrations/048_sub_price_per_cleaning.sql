-- 048: the sub's price per cleaning, next to the monthly Subcontractor Pay.
-- The account forms take either one and work out the other from the
-- Frequency (lib/frequency.ts: cleanings a month, 52 / 12 weeks). Not a
-- sheet column, so it is not part of `unformatted`; NULL = not set (the
-- monthly pay was entered, or the Frequency is Other). Staff only: never
-- sent to the sub portal.
--
-- Schema only, no data change. Running it again changes nothing.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sub_price_per_cleaning NUMERIC(10, 2);
