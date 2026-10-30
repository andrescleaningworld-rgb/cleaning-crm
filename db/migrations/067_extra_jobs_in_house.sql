-- 067: an extra job done by Cleaning World's own crew instead of a sub
-- (Extra Jobs form -> Sub -> "In-house (Cleaning World crew)").
--
--   performed_by  'sub' (every job until now) or 'in_house'. An in-house job
--                 has no sub: sub_id and sub_name are empty and sub_pay is 0,
--                 so it is in no sub's portal, pay or totals.
--   crew_names    optional: who on the crew did it, as typed ("Who did it").
--
-- Two columns. Every existing job stays a sub job; no row is changed.
-- Running it again changes nothing. Until this runs, the In-house choice is
-- hidden (lib/pg/extra-jobs.ts inHouseReady()).
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS performed_by TEXT NOT NULL DEFAULT 'sub';
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS crew_names TEXT NOT NULL DEFAULT '';
ALTER TABLE extra_jobs DROP CONSTRAINT IF EXISTS extra_jobs_performed_by_check;
ALTER TABLE extra_jobs ADD CONSTRAINT extra_jobs_performed_by_check CHECK (performed_by IN ('sub', 'in_house'));
