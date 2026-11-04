-- 070: Office TV slideshow timing (Settings -> Pin Board -> TV slideshow).
--
--   slide_seconds    how long each picture stays up (5-60, default 10).
--   slides_per_show  how many slides one round of the slideshow shows before
--                    the board comes back (1-50, default 6).
--
-- The defaults are what the TV did before, so nothing changes until someone
-- edits them. Running it again changes nothing. Until this runs the TV uses
-- 10 seconds and 6 slides.
ALTER TABLE tv_slideshow_settings ADD COLUMN IF NOT EXISTS slide_seconds INTEGER NOT NULL DEFAULT 10;
ALTER TABLE tv_slideshow_settings ADD COLUMN IF NOT EXISTS slides_per_show INTEGER NOT NULL DEFAULT 6;
ALTER TABLE tv_slideshow_settings DROP CONSTRAINT IF EXISTS tv_slideshow_settings_slide_seconds_check;
ALTER TABLE tv_slideshow_settings ADD CONSTRAINT tv_slideshow_settings_slide_seconds_check CHECK (slide_seconds BETWEEN 5 AND 60);
ALTER TABLE tv_slideshow_settings DROP CONSTRAINT IF EXISTS tv_slideshow_settings_slides_per_show_check;
ALTER TABLE tv_slideshow_settings ADD CONSTRAINT tv_slideshow_settings_slides_per_show_check CHECK (slides_per_show BETWEEN 1 AND 50);
