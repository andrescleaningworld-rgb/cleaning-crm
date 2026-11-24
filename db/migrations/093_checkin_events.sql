-- 093: Customer check-ins — every tap and every note, with the time
-- (lib/pg/customer-checkin.ts).
--
-- The first answer a customer sends is final (customer_checkins.answer is set
-- only while it is still ''). Every later tap and every note is kept here so
-- staff can see what happened, on the account page and in the check-in send
-- history.
--
-- customer_checkin_events  one row per thing the customer did on a check-in:
--   kind     'answer'  the first answer, saved
--            'repeat'  a tap after that (same or another answer): not saved
--                      as the answer, which stays the first one
--            'note'    the feedback box: the note, best way to reach them, photos
--            'stop'    "Stop these emails"
--            'ignored' a tap (or "Stop") that looked like an email scanner:
--                      within 2 minutes of the email going out, seconds after
--                      another tap, or without the page's script / under a
--                      second after the button showed. Never the answer.
--            'earlier' a line copied from the Activity Log, from before this
--                      migration (taps were not kept per check-in then)
--            'staff'   a change staff made (a cleanup of scanner clicks)
--   rating   the answer tapped ('great' / 'ok' / 'attention'), '' for notes
--   note, reach, photos (comma-separated links); for 'ignored', why
--   agent    the browser that sent it (helps spot email security scanners)
--   scanner  true = an email scanner, not a person
--
-- The copy of old Activity Log lines matches each line to the account's last
-- check-in sent before it. Running this again adds nothing twice.
-- The app works before this runs (no history list, everything else the same).

CREATE TABLE IF NOT EXISTS customer_checkin_events (
  id          BIGSERIAL PRIMARY KEY,
  checkin_id  BIGINT NOT NULL,
  account_id  TEXT NOT NULL DEFAULT '',
  at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind        TEXT NOT NULL CHECK (kind IN ('answer', 'repeat', 'note', 'stop', 'ignored', 'earlier', 'staff')),
  rating      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  reach       TEXT NOT NULL DEFAULT '',
  photos      TEXT NOT NULL DEFAULT '',
  agent       TEXT NOT NULL DEFAULT '',
  scanner     BOOLEAN NOT NULL DEFAULT false,
  log_id      BIGINT
);

CREATE INDEX IF NOT EXISTS customer_checkin_events_checkin_idx ON customer_checkin_events (checkin_id, at);
CREATE UNIQUE INDEX IF NOT EXISTS customer_checkin_events_log_idx ON customer_checkin_events (log_id) WHERE log_id IS NOT NULL;

INSERT INTO customer_checkin_events (checkin_id, account_id, at, kind, note, log_id)
SELECT k.id, l.account_id, l.created_at, 'earlier', l.detail, l.id
FROM activity_log l
CROSS JOIN LATERAL (
  SELECT c.id FROM customer_checkins c
  WHERE c.account_id = l.account_id AND c.status = 'sent' AND c.sent_at <= l.created_at
  ORDER BY c.sent_at DESC, c.id DESC
  LIMIT 1
) k
WHERE l.source = 'customer'
  AND l.account_id IS NOT NULL
  AND (l.detail LIKE 'Check-in: the customer%' OR l.detail LIKE 'Check-in feedback:%' OR l.detail = 'The customer stopped the check-in emails.')
ON CONFLICT (log_id) WHERE log_id IS NOT NULL DO NOTHING;
