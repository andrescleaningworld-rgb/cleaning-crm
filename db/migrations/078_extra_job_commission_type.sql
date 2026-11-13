-- 078: an extra job is One-time or Recurring, for its commission
-- (Extra Jobs form -> "Commission": One-time 10% / Recurring 4%).
--
--   commission_type       'one_time' (10%, every job until now) or
--                         'recurring' (4%, paid every month of its range).
--   recurring_start_date  recurring only: the first and last day the
--   recurring_end_date    commission is paid. NULL for a one-time job.
--
-- The job's Sale carries the same % and dates (lib/pg/extra-jobs.ts), so the
-- Sales page and its Pay Period Total see it like any other sale.
--
-- Existing rows: every job stays One-time (its Sale is already 10%). No row is
-- changed otherwise. Safe to run twice. Until this runs, the choice is hidden
-- and every job is One-time (lib/pg/extra-jobs.ts commissionTypeReady()).
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS commission_type TEXT NOT NULL DEFAULT 'one_time';
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS recurring_start_date DATE;
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS recurring_end_date DATE;
ALTER TABLE extra_jobs DROP CONSTRAINT IF EXISTS extra_jobs_commission_type_check;
ALTER TABLE extra_jobs ADD CONSTRAINT extra_jobs_commission_type_check CHECK (commission_type IN ('one_time', 'recurring'));
