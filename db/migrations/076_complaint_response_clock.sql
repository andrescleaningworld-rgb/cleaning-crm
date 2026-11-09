-- 076: The complaint response clock (lib/responseClock.ts, lib/pg/complaint-response.ts).
--
--   complaints.first_response_at   when someone first answered it: a manager
--                                  or the sub changed its status, added a
--                                  note, closed it, or tapped "Got it". Null =
--                                  still waiting (the clock runs from
--                                  created_at, business hours only).
--   complaints.first_response_by   who it was.
--   complaints.response_alert_at   when the "it turned red" text + push went
--                                  to the assigned manager (once per complaint).
--
-- Complaints already here: the closed ones, and the ones more than 7 days
-- old, count as answered (they are not waiting on anyone's clock). Open
-- complaints from the last 7 days start waiting, so they show the clock.
-- Safe to run twice.

ALTER TABLE complaints ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS first_response_by TEXT NOT NULL DEFAULT '';
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS response_alert_at TIMESTAMPTZ;

UPDATE complaints
SET first_response_at = updated_at, first_response_by = 'Before the response clock'
WHERE first_response_at IS NULL
  AND (lower(btrim(status)) LIKE 'closed%' OR lower(btrim(status)) LIKE 'resolved%' OR lower(btrim(status)) LIKE 'merged%'
       OR created_at < now() - interval '7 days');

CREATE INDEX IF NOT EXISTS complaints_waiting_idx ON complaints (created_at) WHERE first_response_at IS NULL;
