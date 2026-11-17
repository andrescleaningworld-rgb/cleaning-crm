-- 080: Customer check-ins — "Viewed" and the feedback box (lib/pg/customer-checkin.ts).
--
-- customer_checkins (079) gets:
--   opened_at     the first time the email was opened (the 1x1 picture in the
--                 email, /checkin/<token>/open, loaded by the mail app), or
--                 the first answer when the pictures were blocked. Approximate:
--                 some mail apps block pictures, some load them by themselves.
--   open_count    how many times the picture was loaded.
--   reach         "Best way to reach you" from the feedback box (phone or email).
--   commented_at  when the customer last sent the feedback box.
--
-- Nothing else changes. The app works before this runs (no Viewed, no
-- "Best way to reach you" saved). Safe to run twice.

ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS opened_at    TIMESTAMPTZ;
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS open_count   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS reach        TEXT NOT NULL DEFAULT '';
ALTER TABLE customer_checkins ADD COLUMN IF NOT EXISTS commented_at TIMESTAMPTZ;
