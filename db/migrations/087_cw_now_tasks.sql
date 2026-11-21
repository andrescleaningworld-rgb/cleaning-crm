-- 087: CW Now to-dos for subs (lib/pg/cw-now-tasks.ts, the "CW Now" square on
-- the Pin Board, the sub's task screen at /porter/task/<token>).
--
-- cw_now_tasks       one to-do for one sub on one account. `token` is the
--                    private link: long, random, and it opens this task only.
--                    status: needs_link (nothing with the link has gone out)
--                    -> sent -> seen -> done; or cancelled.
-- cw_now_task_files  the office's files and the photos the sub adds.
-- cw_now_task_events the history: texts, shares, seen, notes, done, reminders.
-- subcontractors.language  en / es / pt: the sub's texts and task screen.
-- handoff_items kind 'cwnow'  the task's paper on the board.
--
-- Nothing else changes. The app works before this runs (the CW Now square
-- says it is not turned on yet). Safe to run twice.

ALTER TABLE handoff_items DROP CONSTRAINT IF EXISTS handoff_items_kind_check;
ALTER TABLE handoff_items ADD CONSTRAINT handoff_items_kind_check CHECK (kind IN ('account', 'update', 'order', 'issue', 'extra', 'complaint', 'supply', 'note', 'cwnow'));

ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'en';
ALTER TABLE subcontractors DROP CONSTRAINT IF EXISTS subcontractors_language_check;
ALTER TABLE subcontractors ADD CONSTRAINT subcontractors_language_check CHECK (language IN ('en', 'es', 'pt'));

CREATE TABLE IF NOT EXISTS cw_now_tasks (
  id                    BIGSERIAL PRIMARY KEY,
  token                 TEXT NOT NULL UNIQUE,
  account_id            TEXT NOT NULL,
  account_name          TEXT NOT NULL DEFAULT '',
  sub_id                TEXT REFERENCES subcontractors (id) ON DELETE SET NULL,
  sub_name              TEXT NOT NULL DEFAULT '',
  task                  TEXT NOT NULL,
  -- The task in Spanish and Portuguese: { "es": "...", "pt": "..." }.
  translations          JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_date              DATE NOT NULL,
  due_time              TEXT NOT NULL DEFAULT '',
  priority              TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
  status                TEXT NOT NULL DEFAULT 'needs_link' CHECK (status IN ('needs_link', 'sent', 'seen', 'done', 'cancelled')),
  link_sent_at          TIMESTAMPTZ,
  seen_at               TIMESTAMPTZ,
  done_at               TIMESTAMPTZ,
  done_by               TEXT NOT NULL DEFAULT '',
  cancelled_at          TIMESTAMPTZ,
  created_by            TEXT NOT NULL DEFAULT '',
  created_by_staff_id   TEXT NOT NULL DEFAULT '',
  calendar_event_id     TEXT NOT NULL DEFAULT '',
  calendar_sync_failed  BOOLEAN NOT NULL DEFAULT false,
  reminded_before_at    TIMESTAMPTZ,
  reminded_day_at       TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cw_now_tasks_open_due_idx ON cw_now_tasks (due_date) WHERE status NOT IN ('done', 'cancelled');
CREATE INDEX IF NOT EXISTS cw_now_tasks_account_idx ON cw_now_tasks (account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cw_now_tasks_sub_idx ON cw_now_tasks (sub_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cw_now_task_files (
  id            BIGSERIAL PRIMARY KEY,
  task_id       BIGINT NOT NULL REFERENCES cw_now_tasks (id) ON DELETE CASCADE,
  source        TEXT NOT NULL CHECK (source IN ('office', 'sub')),
  file_url      TEXT NOT NULL,
  file_name     TEXT NOT NULL DEFAULT '',
  file_size     BIGINT NOT NULL DEFAULT 0,
  content_type  TEXT NOT NULL DEFAULT '',
  uploaded_by   TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cw_now_task_files_task_idx ON cw_now_task_files (task_id, created_at);

CREATE TABLE IF NOT EXISTS cw_now_task_events (
  id          BIGSERIAL PRIMARY KEY,
  task_id     BIGINT NOT NULL REFERENCES cw_now_tasks (id) ON DELETE CASCADE,
  event       TEXT NOT NULL CHECK (event IN ('created', 'text', 'share', 'seen', 'note', 'photo', 'reminder', 'done', 'reopened', 'cancelled')),
  method      TEXT NOT NULL DEFAULT '',
  detail      TEXT NOT NULL DEFAULT '',
  -- A note the sub wrote in Spanish or Portuguese, in English for the office.
  detail_en   TEXT NOT NULL DEFAULT '',
  by_name     TEXT NOT NULL DEFAULT '',
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cw_now_task_events_task_idx ON cw_now_task_events (task_id, at DESC);
