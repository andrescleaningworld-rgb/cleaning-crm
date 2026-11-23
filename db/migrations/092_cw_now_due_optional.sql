-- 092: a CW Now to-do can be saved with no due date. No date = never late, no
-- reminders, and not on any calendar. Existing to-dos keep their dates.
-- Running it again changes nothing.

ALTER TABLE cw_now_tasks ALTER COLUMN due_date DROP NOT NULL;
