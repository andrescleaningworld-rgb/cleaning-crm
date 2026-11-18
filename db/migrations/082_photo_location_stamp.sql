-- 082: Crew photos — time stamp and "taken on site" check
-- (lib/pg/crew-photos.ts, lib/photoLocation.ts, lib/photoStamp.tsx).
--
-- photo_index gets, for each CW Now (Crew Link) photo sent from now on:
--   original_url     the photo as the phone sent it, with no stamp. url (what
--                    staff and the customer portal show) is the stamped copy:
--                    date + time (New York, the server's time), account name
--                    and address burned into a bar at the bottom.
--   uploaded_at      when the server got the photo (the stamp's time).
--   geo_lat, geo_lng, geo_accuracy_m
--                    where the phone said it was when the photo was added,
--                    and how sure it was (meters). Only at that moment: no
--                    tracking. NULL when the crew did not allow it.
--   site_distance_m  meters from the account's map point.
--   site_check       'on_site' (within 300 ft, allowing for the phone's
--                    accuracy), 'off_site', 'no_location' (the phone gave
--                    none), 'no_site' (the account is not on the map), or ''
--                    (not checked: older photos and other kinds of photos).
-- Staff see ✅ / ⚠️ / ❓ from it. The customer portal never reads these columns.
--
-- Nothing else changes; older photos keep '' and NULL. The app works before
-- this runs (photos go in as before, with no stamp and no check). Safe to run
-- twice.

ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS original_url    TEXT NOT NULL DEFAULT '';
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS uploaded_at     TIMESTAMPTZ;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS geo_lat         DOUBLE PRECISION;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS geo_lng         DOUBLE PRECISION;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS geo_accuracy_m  REAL;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS site_distance_m REAL;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS site_check      TEXT NOT NULL DEFAULT '';
ALTER TABLE photo_index DROP CONSTRAINT IF EXISTS photo_index_site_check_check;
ALTER TABLE photo_index ADD CONSTRAINT photo_index_site_check_check CHECK (site_check IN ('', 'on_site', 'off_site', 'no_location', 'no_site'));
CREATE INDEX IF NOT EXISTS photo_index_site_check_idx ON photo_index (site_check) WHERE site_check IN ('off_site', 'no_location', 'no_site');
