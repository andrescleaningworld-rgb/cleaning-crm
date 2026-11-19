-- 085: CW Now "Photo Checklist" crew screen (app/porter/[code]/CrewPhotoChecklist.tsx).
-- Taking a photo of an item checks it off; everything is kept on the phone
-- first and sent when there is signal.
--
-- checklist_templates.crew_screen   which crew screen the account's CW Now
--                                   link opens: 'classic' (as today, the
--                                   default for every account) or 'photo'
--                                   (Photo Checklist). Set in the account's
--                                   CW Now card.
--
-- photo_index (crew photos taken on the Photo Checklist screen only):
--   visit_id     the phone-made id of the visit (= checklist_submissions.client_id
--                once the crew taps Finish). Photos added after Finish, from
--                the gallery, carry the same id, so the Work Report finds them.
--   item_key     the checklist item the photo is for ('extra' = "+ Extra Photo").
--   time_source  where taken_at came from: 'camera' (taken in the app),
--                'exif' (a gallery photo's own date), 'added_later' (a
--                gallery photo with no date: taken_at = when it was added).
--   added_at     when the crew added it on the phone (the "taken more than a
--                day earlier" check in the report compares with this).
--
-- Every column is new and empty for old rows; no row is changed. The app
-- works before this runs (every account stays Classic, the Photo Checklist
-- cannot be picked). Safe to run twice. Take a Neon backup branch first.

ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS crew_screen TEXT NOT NULL DEFAULT 'classic';
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checklist_templates_crew_screen_check') THEN
    ALTER TABLE checklist_templates ADD CONSTRAINT checklist_templates_crew_screen_check CHECK (crew_screen IN ('classic', 'photo'));
  END IF;
END $$;

ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS visit_id    TEXT;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS item_key    TEXT;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS time_source TEXT;
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS added_at    TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS photo_index_visit_idx ON photo_index (visit_id) WHERE visit_id IS NOT NULL;
