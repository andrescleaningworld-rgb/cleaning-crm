-- tips_seen: which first-time tips a person has already seen, so "Got it"
-- holds on every phone and computer they use, not only in one browser.
--
-- One row per person and tip. A tip is per kind of screen ("to-do",
-- "account", "board-add"), never per record. The row with tip_id '*' means
-- that person turned tips off altogether ("Skip all", or Settings).
--
--   person   the staff login's own id (falls back to the name on old logins)
CREATE TABLE IF NOT EXISTS tips_seen (
  person  TEXT NOT NULL,
  tip_id  TEXT NOT NULL,
  seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person, tip_id)
);
