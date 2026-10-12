-- Office extras: the sub score alert, the TV slideshow star, and the dates
-- the board calendar shows (birthdays, work anniversaries, holidays, office
-- closed, company events). Postgres only. Nothing here is imported from or
-- written to Google Sheets. It only adds tables and one column. Idempotent.
-- Never edit after applying.

-- One row each time a sub's score drops below 6 (lib/pg/sub-score-alerts.ts).
--   baseline         true = the sub was already below 6 when alerts were
--                    turned on: the office sees it, the sub gets no email
--   emailed_at       when the alert email went to the sub; NULL = none went
--   acknowledged_at  someone in the office tapped "Got it": it leaves the list
--   recovered_at     the score came back to 6 or more. Only after that can the
--                    same sub get a new alert (one open drop per sub at a time)
CREATE TABLE IF NOT EXISTS sub_score_alerts (
  id               BIGSERIAL PRIMARY KEY,
  subcontractor_id TEXT NOT NULL,
  sub_name         TEXT NOT NULL DEFAULT '',
  sub_email        TEXT NOT NULL DEFAULT '',
  score            NUMERIC(4, 1) NOT NULL,
  reasons          JSONB NOT NULL DEFAULT '[]'::jsonb,
  baseline         BOOLEAN NOT NULL DEFAULT false,
  emailed_at       TIMESTAMPTZ,
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  TEXT NOT NULL DEFAULT '',
  recovered_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sub_score_alerts_one_drop_idx ON sub_score_alerts (subcontractor_id) WHERE recovered_at IS NULL;
CREATE INDEX IF NOT EXISTS sub_score_alerts_open_idx ON sub_score_alerts (created_at DESC) WHERE acknowledged_at IS NULL;

-- One row, written the first time the scores are checked: from then on a drop
-- is a real drop and the sub is emailed.
CREATE TABLE IF NOT EXISTS sub_score_alert_state (
  id         BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The star on a photo: "Show on TV". Only starred photos are in the TV slideshow.
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS show_on_tv BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS photo_index_tv_idx ON photo_index (taken_at DESC) WHERE show_on_tv;

-- Birthday and first day of work, for staff and managers only (never subs or
-- customers). Its own table, keyed by the Staff id, so the Staff list itself
-- is not changed. Only the day and month of a birthday are ever shown.
CREATE TABLE IF NOT EXISTS staff_dates (
  staff_id   TEXT PRIMARY KEY,
  birthday   DATE,
  work_start DATE,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Days added to the board calendar by hand.
--   kind            'holiday', 'closed' (office closed) or 'event' (company event)
--   repeats_yearly  the same day every year (July 4)
CREATE TABLE IF NOT EXISTS calendar_events (
  id             BIGSERIAL PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('holiday', 'closed', 'event')),
  title          TEXT NOT NULL,
  day            DATE NOT NULL,
  repeats_yearly BOOLEAN NOT NULL DEFAULT false,
  created_by     TEXT NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_events_day_idx ON calendar_events (day);
