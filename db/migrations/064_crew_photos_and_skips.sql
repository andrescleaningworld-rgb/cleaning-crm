-- 064: Crew Link "Send photos", crew photos in the customer portal, and
-- "Some things I couldn't do". Only widens what is allowed and adds columns
-- with defaults: no row is changed and the code from before keeps working.
-- Running it again changes nothing.
--
-- 1. Crew photos go in the same place as every other photo (Blob storage +
--    photo_index), with:
--      kind                  'Crew' (one more value)
--      tag                   the crew's optional one-tap tag: '' | before | after | problem
--      hidden_from_customer  true = the customer portal does not show it.
--                            A "problem" photo starts hidden; staff un-hide it
--                            on the Photos page.
ALTER TABLE photo_index DROP CONSTRAINT IF EXISTS photo_index_kind_check;
ALTER TABLE photo_index ADD CONSTRAINT photo_index_kind_check
  CHECK (kind IN ('Complaint', 'Crew problem', 'Sub photo', 'Extra job', 'Estimate', 'Equipment', 'Visit', 'Site survey', 'Crew'));
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS tag TEXT NOT NULL DEFAULT '' CHECK (tag IN ('', 'before', 'after', 'problem'));
ALTER TABLE photo_index ADD COLUMN IF NOT EXISTS hidden_from_customer BOOLEAN NOT NULL DEFAULT false;
-- The customer portal's Photos: one account's crew photos, newest first.
CREATE INDEX IF NOT EXISTS photo_index_crew_idx ON photo_index (account_id, taken_at DESC) WHERE kind = 'Crew';

-- 2. Per account: "Show crew photos to customer" (on unless the office turns
--    it off). On the Crew Link row of the account (checklist_templates).
ALTER TABLE IF EXISTS checklist_templates ADD COLUMN IF NOT EXISTS show_photos_to_customer BOOLEAN NOT NULL DEFAULT true;

-- Not in this migration, because they need no new column:
--   "Must do every night"   a mark on the checklist item (checklist_tabs.sections_json, mustDo)
--   why an item was skipped the item's skipReason in the sent checklist (checklist_submissions.items_snapshot_json)
--   the office alert        one Pin Board paper per account (handoff_items kind 'note', item_id 'skip:<account>')
