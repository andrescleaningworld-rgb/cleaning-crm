-- 063: the one setup wizard for a new account (the Onboarding Checklist,
-- app/components/OnboardingChecklist.tsx; rules in lib/setupWizard.ts).
-- Only widens what is allowed and adds two empty columns: no row is changed
-- and the code from before this migration keeps working against it.
-- Running it again changes nothing.
--
-- 1. Supplies: a third choice, "Provided by customer (not included)".
--    Same field as "Supplies included" and "Supplies billed to customer":
--    supply_account_modes.mode gets one more value, 'customer'.
ALTER TABLE supply_account_modes DROP CONSTRAINT IF EXISTS supply_account_modes_mode_check;
ALTER TABLE supply_account_modes ADD CONSTRAINT supply_account_modes_mode_check CHECK (mode IN ('included', 'billed', 'customer'));

-- 2. Site survey photos: the wizard's shot list ("Entrance / front door",
--    "Alarm panel", ...). They go in the same place as every other photo
--    (Blob storage + photo_index), with:
--      kind       'Site survey' (one more value)
--      caption    the shot's label; '' for every photo from before
--      thumb_url  a small copy (about 400px) kept next to the full photo;
--                 '' = none, and the screens fall back to the full photo
ALTER TABLE photo_index DROP CONSTRAINT IF EXISTS photo_index_kind_check;
ALTER TABLE photo_index ADD CONSTRAINT photo_index_kind_check
  CHECK (kind IN ('Complaint', 'Crew problem', 'Sub photo', 'Extra job', 'Estimate', 'Equipment', 'Visit', 'Site survey'));
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS caption TEXT NOT NULL DEFAULT '';
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS thumb_url TEXT NOT NULL DEFAULT '';
CREATE INDEX IF NOT EXISTS photo_index_survey_idx ON photo_index (account_id) WHERE kind = 'Site survey';
