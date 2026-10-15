-- 042: time on site, appointment cleanings, crews, and the end of "Evening".
-- What Coverage needs to tell whether a sub has the time to take a new job.
--
-- Only adds. Every new column has a default, so the code from before this
-- migration keeps working against it.

-- How long a cleaning takes at the account. Every account starts at 1h 30m,
-- marked as an estimate, until the office or the sub confirms it.
-- source: 'est' (the starting guess), 'office', or 'sub'.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minutes_on_site INTEGER NOT NULL DEFAULT 90;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minutes_on_site_source TEXT NOT NULL DEFAULT 'est';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minutes_on_site_by TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minutes_on_site_at TIMESTAMPTZ;

-- What the sub said in their portal, kept apart when it differs from what the
-- office set by more than 30 minutes, so the office can look at it.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sub_minutes_on_site INTEGER;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS sub_minutes_on_site_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_minutes_on_site_check') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_minutes_on_site_check CHECK (minutes_on_site BETWEEN 15 AND 720);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounts_minutes_on_site_source_check') THEN
    ALTER TABLE accounts ADD CONSTRAINT accounts_minutes_on_site_source_check CHECK (minutes_on_site_source IN ('est', 'office', 'sub'));
  END IF;
END
$$;

-- A schedule day is either a time window (Morning, Midday, Afternoon,
-- Evening) or an appointment at an exact start time.
ALTER TABLE sub_schedules ADD COLUMN IF NOT EXISTS schedule_type TEXT NOT NULL DEFAULT 'window';
ALTER TABLE sub_schedules ADD COLUMN IF NOT EXISTS start_time TIME;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sub_schedules_schedule_type_check') THEN
    ALTER TABLE sub_schedules ADD CONSTRAINT sub_schedules_schedule_type_check CHECK (schedule_type IN ('window', 'appointment'));
  END IF;
END
$$;

-- How many jobs a sub can do at the same time. The office sets it.
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS crews INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subcontractors_crews_check') THEN
    ALTER TABLE subcontractors ADD CONSTRAINT subcontractors_crews_check CHECK (crews BETWEEN 1 AND 20);
  END IF;
END
$$;

-- Office settings for schedules. "Evening" has no end of its own; this is it.
CREATE TABLE IF NOT EXISTS schedule_settings (
  id              BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  evening_ends_at TIME NOT NULL DEFAULT '23:00',
  updated_by      TEXT NOT NULL DEFAULT '',
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO schedule_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
