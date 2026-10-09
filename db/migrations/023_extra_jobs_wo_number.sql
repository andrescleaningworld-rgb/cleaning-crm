-- Extra Jobs: an optional "WO / Estimate #". Postgres only.
--
-- The customer's or the office's own work order or estimate number, typed as
-- it is (free text, may be empty). It is printed on both work order copies,
-- goes in the office emails and on the job's Sale, and can be searched on
-- the Extra Jobs page. Our own job number (EJ-1001 ...) stays as it is.
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS wo_number TEXT NOT NULL DEFAULT '';
