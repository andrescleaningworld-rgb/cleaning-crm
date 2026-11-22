-- 088: a CW Now task can belong to an extra job or a complaint, and can carry
-- its AI task page (lib/pg/cw-now-tasks.ts). Only adds. No row changes. The app
-- works before this runs (those options stay off). Safe to run twice.

ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS extra_job_id BIGINT REFERENCES extra_jobs (id) ON DELETE SET NULL;
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS complaint_row_id BIGINT REFERENCES complaints (id) ON DELETE SET NULL;
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS complaint_mode TEXT NOT NULL DEFAULT '';
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS task_page JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cw_now_tasks DROP CONSTRAINT IF EXISTS cw_now_tasks_complaint_mode_check;
ALTER TABLE cw_now_tasks ADD CONSTRAINT cw_now_tasks_complaint_mode_check CHECK (complaint_mode IN ('', 'move', 'duplicate'));

-- A task is an extra job or a complaint, never both.
ALTER TABLE cw_now_tasks DROP CONSTRAINT IF EXISTS cw_now_tasks_one_link_check;
ALTER TABLE cw_now_tasks ADD CONSTRAINT cw_now_tasks_one_link_check CHECK (extra_job_id IS NULL OR complaint_row_id IS NULL);

-- One open task per complaint, and one live task per extra job.
CREATE UNIQUE INDEX IF NOT EXISTS cw_now_tasks_open_complaint_idx ON cw_now_tasks (complaint_row_id) WHERE complaint_row_id IS NOT NULL AND status NOT IN ('done', 'cancelled');
CREATE UNIQUE INDEX IF NOT EXISTS cw_now_tasks_extra_job_idx ON cw_now_tasks (extra_job_id) WHERE extra_job_id IS NOT NULL AND status <> 'cancelled';
