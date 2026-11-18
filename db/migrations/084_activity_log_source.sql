-- 084: Activity Log in three tabs: Admin | Subs | Customers (lib/activityLog.ts,
-- Settings -> Activity Log).
--
-- activity_log gets:
--   source      which portal the action came from: 'admin' (staff), 'sub'
--               (the sub portal, CW Now crews, the team hub) or 'customer'
--               (the customer portal, check-in answers, shared preview links)
--   account_id  the account it is about, for the Customers tab's account filter
--   sub_id      the sub it is about or by, for the Subs tab's sub filter
--
-- Old rows are sorted out from what they already say:
--   sub       actor_role sub / porter / team-hub, or a description saying it
--             came from the sub portal ("Insurance sent from the sub portal")
--   customer  actor_role guest / customer, or the actor named "Customer"
--             (check-in answers)
--   admin     everything else
-- account_id / sub_id come from the row's own record (entity_type account /
-- subcontractor). Nothing else changes; no row is deleted. The app works
-- before this runs (one mixed list, as today). Safe to run twice.

ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS source     TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS account_id TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS sub_id     TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'activity_log_source_check') THEN
    ALTER TABLE activity_log ADD CONSTRAINT activity_log_source_check CHECK (source IN ('admin', 'sub', 'customer'));
  END IF;
END $$;

UPDATE activity_log SET source = 'sub'
WHERE source = 'admin'
  AND (actor_role IN ('sub', 'porter', 'team-hub')
       OR detail ILIKE '%sent from the sub portal%');

UPDATE activity_log SET source = 'customer'
WHERE source = 'admin'
  AND (actor_role IN ('guest', 'customer') OR actor_name = 'Customer');

-- The sub portal's own insurance upload was stamped as a manager: it was the sub.
UPDATE activity_log SET actor_role = 'sub'
WHERE source = 'sub' AND actor_role = 'manager' AND detail ILIKE 'Insurance sent from the sub portal%';

UPDATE activity_log SET account_id = entity_id WHERE account_id IS NULL AND entity_type = 'account' AND entity_id IS NOT NULL;
UPDATE activity_log SET sub_id = entity_id WHERE sub_id IS NULL AND entity_type = 'subcontractor' AND entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS activity_log_source_time_idx ON activity_log (source, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_account_idx ON activity_log (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS activity_log_sub_idx ON activity_log (sub_id) WHERE sub_id IS NOT NULL;
