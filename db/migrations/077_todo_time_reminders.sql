-- 077: to-dos get an optional time, the CRM's own due-day reminders, and
-- the link to a new account's step (lib/pg/todo-extras.ts, lib/pg/flow-todos.ts).
--
--   due_time          'HH:MM' (24 hours, New York time) when the to-do is at
--                     a set time (a site survey at 10:30); '' = all day, as
--                     every to-do so far. A to-do with a time is a timed
--                     event on the calendar instead of an all-day one.
--   reminded_day_at   when the 8 AM due-day push + text went to the
--                     assigned manager (cron /api/cron/todo-reminders).
--                     NULL = not yet. Cleared when the due date or time changes.
--   reminded_hour_at  when the "in 1 hour" push + text went (timed to-dos only).
--   flow_key          '<account id>:<step>' for a to-do made by a new
--                     account's steps (survey, walkthrough, firstClean,
--                     followUp). NULL for every other to-do. One to-do per
--                     account step: the unique index makes a second one fail.
--
-- Existing rows: due_time '', the rest NULL. Nothing else changes. Safe to run twice.

ALTER TABLE todos
  ADD COLUMN IF NOT EXISTS due_time TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reminded_day_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminded_hour_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS flow_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS todos_flow_key_idx ON todos (flow_key) WHERE flow_key IS NOT NULL;
