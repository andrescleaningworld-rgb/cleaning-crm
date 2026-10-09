-- Extra Jobs: editing a job while it is on "Set up", and cancelling it.
-- Postgres only. Nothing here is imported from or written to Google Sheets.
--
-- A third status, 'cancelled': the job stays in the list (under "Cancelled")
-- with who cancelled it, when and why. Its Sale is cancelled with it.
ALTER TABLE extra_jobs DROP CONSTRAINT IF EXISTS extra_jobs_status_check;
ALTER TABLE extra_jobs ADD CONSTRAINT extra_jobs_status_check CHECK (status IN ('setup', 'done', 'cancelled'));

--   cancel_reason      why; the Cancel button does not work without one
--   cancel_emailed_at  when the office was told; NULL = that email did not go out
--   edited_by / edited_at   the last change made while the job was on "Set up"
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS cancelled_by TEXT NOT NULL DEFAULT '';
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS cancel_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS cancel_emailed_at TIMESTAMPTZ;
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS edited_by TEXT NOT NULL DEFAULT '';
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
