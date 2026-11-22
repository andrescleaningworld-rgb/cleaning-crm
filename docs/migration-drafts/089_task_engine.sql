-- DRAFT. This folder never runs. To use it, it must be copied to db/migrations/ on purpose (Phase 7).
-- Status Nov 22, 2026: run on the practice database. NOT run on production.
-- 089: a task can belong to a manager as well as a sub, with the fields a to-do needs.
-- No row changes. No screen uses it until Phase 8. Safe to run twice.

-- Who has it. Every existing task stays 'sub'.
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS assignee_type TEXT NOT NULL DEFAULT 'sub';
ALTER TABLE cw_now_tasks DROP CONSTRAINT IF EXISTS cw_now_tasks_assignee_type_check;
ALTER TABLE cw_now_tasks ADD CONSTRAINT cw_now_tasks_assignee_type_check CHECK (assignee_type IN ('sub', 'staff'));
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS assignee_staff_id TEXT REFERENCES staff (id) ON DELETE SET NULL;
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS assignee_name TEXT NOT NULL DEFAULT '';

-- Some to-dos have no account or no due date.
ALTER TABLE cw_now_tasks ALTER COLUMN account_id DROP NOT NULL;
ALTER TABLE cw_now_tasks ALTER COLUMN due_date DROP NOT NULL;

-- What a to-do carries today.
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS legacy_todo_id TEXT;
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS flow_key TEXT;
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT '';
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS outcome TEXT NOT NULL DEFAULT '';
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS group_id TEXT NOT NULL DEFAULT '';
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS sync_to_calendar BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cw_now_tasks ADD COLUMN IF NOT EXISTS reminded_hour_at TIMESTAMPTZ;

-- A manager's task is Open or In Progress instead of Needs link, Sent or Seen.
ALTER TABLE cw_now_tasks DROP CONSTRAINT IF EXISTS cw_now_tasks_status_check;
ALTER TABLE cw_now_tasks ADD CONSTRAINT cw_now_tasks_status_check CHECK (status IN ('needs_link', 'sent', 'seen', 'open', 'in_progress', 'done', 'cancelled'));

-- More kinds of history lines.
ALTER TABLE cw_now_task_events DROP CONSTRAINT IF EXISTS cw_now_task_events_event_check;
ALTER TABLE cw_now_task_events ADD CONSTRAINT cw_now_task_events_event_check CHECK (event IN ('created', 'text', 'share', 'seen', 'note', 'photo', 'reminder', 'done', 'reopened', 'cancelled', 'assigned', 'edited', 'status', 'outcome'));

-- One task per old to-do, and one per new-account step, so a re-run can never make doubles.
CREATE UNIQUE INDEX IF NOT EXISTS cw_now_tasks_legacy_todo_idx ON cw_now_tasks (legacy_todo_id) WHERE legacy_todo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cw_now_tasks_flow_key_idx ON cw_now_tasks (flow_key) WHERE flow_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cw_now_tasks_staff_idx ON cw_now_tasks (assignee_staff_id, due_date) WHERE assignee_staff_id IS NOT NULL;
