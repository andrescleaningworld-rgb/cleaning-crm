-- Area 15 – Wrap-up: the links worked out at import become real foreign keys.
-- Idempotent. Never edit after applying.
--
-- Every *_ref / subcontractor_id column below was filled by exact match only
-- and has no value that points at nothing (checked: 0 orphans in each). A
-- link is a help, never a requirement: the text the sheet had stays in the
-- row, so the key is ON DELETE SET NULL (an account or sub that goes away
-- un-links its rows instead of blocking or deleting them) and ON UPDATE
-- CASCADE (an id that is corrected is corrected everywhere).
--
-- Not here, on purpose: the keys from manager_accounts, equipment_staff_pins
-- and vehicles to staff. While Staff is still saved in Sheets a new staff
-- member would not be in Postgres, and the key would block their login, PIN
-- or vehicle. They are added after the People switch is on in production
-- (see docs/CUTOVER_RUNBOOK.md).
DO $$
DECLARE
  link RECORD;
BEGIN
  FOR link IN
    SELECT * FROM (VALUES
      ('complaints',           'account_ref',      'accounts',       'id'),
      ('visits',               'account_ref',      'accounts',       'id'),
      ('todos',                'account_ref',      'accounts',       'id'),
      ('sales',                'account_ref',      'accounts',       'id'),
      ('portal_access',        'account_ref',      'accounts',       'id'),
      ('portal_requests',      'account_ref',      'accounts',       'id'),
      ('photos',               'account_ref',      'accounts',       'id'),
      ('sub_schedules',        'account_ref',      'accounts',       'id'),
      ('schedule_exceptions',  'account_ref',      'accounts',       'id'),
      ('subcontractor_visits', 'account_ref',      'accounts',       'id'),
      ('sub_supply_orders',    'account_ref',      'accounts',       'id'),
      ('sub_portal_issues',    'account_ref',      'accounts',       'id'),
      ('sub_schedules',        'subcontractor_id', 'subcontractors', 'id'),
      ('subcontractor_visits', 'subcontractor_id', 'subcontractors', 'id'),
      ('sub_supply_orders',    'subcontractor_id', 'subcontractors', 'id'),
      ('sub_portal_issues',    'subcontractor_id', 'subcontractors', 'id'),
      ('document_sends',       'subcontractor_id', 'subcontractors', 'id')
    ) AS t(tbl, col, ref_tbl, ref_col)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = link.tbl || '_' || link.col || '_fkey' AND conrelid = ('public.' || link.tbl)::regclass
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I (%I) ON DELETE SET NULL ON UPDATE CASCADE',
        link.tbl, link.tbl || '_' || link.col || '_fkey', link.col, link.ref_tbl, link.ref_col
      );
    END IF;
  END LOOP;
END $$;

-- The lookups that follow a link.
CREATE INDEX IF NOT EXISTS visits_account_ref_idx ON visits (account_ref);
CREATE INDEX IF NOT EXISTS todos_account_ref_idx ON todos (account_ref);
CREATE INDEX IF NOT EXISTS sub_schedules_account_ref_idx ON sub_schedules (account_ref);
CREATE INDEX IF NOT EXISTS sub_schedules_subcontractor_idx ON sub_schedules (subcontractor_id);
CREATE INDEX IF NOT EXISTS portal_access_account_ref_idx ON portal_access (account_ref);
CREATE INDEX IF NOT EXISTS sub_supply_orders_subcontractor_idx ON sub_supply_orders (subcontractor_id);
