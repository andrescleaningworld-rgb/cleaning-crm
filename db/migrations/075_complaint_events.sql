-- 075: What happened to each complaint, one row per event
-- (lib/pg/complaint-events.ts).
--
--   complaint_events   complaint_id = complaints.id (the internal number,
--                      not the "COMP-..." text). kind says what it was:
--                        'sub_notified'  the sub was told (one row per
--                                        channel: 'email' or 'text'; status
--                                        'sent' / 'failed' / 'skipped' and
--                                        why in detail; by = who pressed
--                                        "Notify sub", or "System").
--                        'customer_added' the customer added notes / photos
--                                        to their open complaint (detail =
--                                        the note, photos = the links).
--                        'merged_into' / 'merged_from'  a staff merge: on the
--                                        closed one and on the main one
--                                        (detail names the other complaint).
--                        'acknowledged'  "Got it" from staff or the sub (migration 076
--                                        keeps the first answer on the complaint).
--                        'response_alert' the red-clock text + push to the manager.
--                        'fixed'         proof it was fixed when it was resolved:
--                                        channel 'photo' (photos = the after
--                                        photos) or 'no_photo' (staff only,
--                                        detail = why); by = staff or the sub.
--                        'customer_emailed' an email to the customer ("We got
--                                        it" / "It's fixed"): status sent / failed.
--                      photos: comma-separated picture links, when the event
--                      brought any.
--
-- Nothing else changes. Safe to run twice.

CREATE TABLE IF NOT EXISTS complaint_events (
  id            BIGSERIAL PRIMARY KEY,
  complaint_id  BIGINT NOT NULL REFERENCES complaints (id) ON DELETE CASCADE,
  kind          TEXT NOT NULL,
  channel       TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL DEFAULT '',
  photos        TEXT NOT NULL DEFAULT '',
  by_name       TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS complaint_events_complaint_idx ON complaint_events (complaint_id, created_at DESC);
CREATE INDEX IF NOT EXISTS complaint_events_kind_idx ON complaint_events (kind, created_at DESC);
