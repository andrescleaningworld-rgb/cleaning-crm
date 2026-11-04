-- 068: each schedule day gets its own times (the shared schedule form,
-- app/components/schedule-editor.tsx).
--
--   window_start, window_end  "Anytime between 6:00 PM and 10:00 PM". Empty on
--                             every row until now: those rows keep their
--                             named window (Morning, Midday, Afternoon,
--                             Evening) and its usual hours.
--   minutes_on_site           "Time on site" for that day. Empty = not set:
--                             Coverage then uses the account's own time on
--                             site (accounts.minutes_on_site), as before.
--
-- Only adds three empty columns; no row is changed. Running it again changes
-- nothing. Until this runs, the form still saves (days, frequency and the
-- named window), just without these three values.
ALTER TABLE sub_schedules ADD COLUMN IF NOT EXISTS window_start TIME;
ALTER TABLE sub_schedules ADD COLUMN IF NOT EXISTS window_end TIME;
ALTER TABLE sub_schedules ADD COLUMN IF NOT EXISTS minutes_on_site INTEGER;

ALTER TABLE sub_schedules DROP CONSTRAINT IF EXISTS sub_schedules_minutes_on_site_check;
ALTER TABLE sub_schedules ADD CONSTRAINT sub_schedules_minutes_on_site_check
  CHECK (minutes_on_site IS NULL OR minutes_on_site BETWEEN 15 AND 720);

ALTER TABLE sub_schedules DROP CONSTRAINT IF EXISTS sub_schedules_window_check;
ALTER TABLE sub_schedules ADD CONSTRAINT sub_schedules_window_check
  CHECK ((window_start IS NULL AND window_end IS NULL) OR (window_start IS NOT NULL AND window_end IS NOT NULL AND window_end > window_start));
