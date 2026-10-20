-- 051: one new-account system. The last accounts still open in the old
-- 7-step handoff steps are finished there, and HAIGuard moves into the
-- 8-step New Account flow (account_flows, migration 046). Approved by the
-- owner on 2026-10-20 after a Neon backup (backup-before-old-flow-retire).
--
-- Data only, no schema change. Each part checks before it writes, so
-- running it again changes nothing.

-- 1. Already cleaning: done in the old steps and off the Pin Board.
UPDATE handoff_items
SET done_at = now(),
    board_done_at = CASE WHEN board_pinned_at IS NOT NULL AND board_done_at IS NULL THEN now() ELSE board_done_at END,
    board_done_by = CASE WHEN board_pinned_at IS NOT NULL AND board_done_at IS NULL THEN 'Old new-account steps retired' ELSE board_done_by END
WHERE kind = 'account'
  AND done_at IS NULL
  AND item_id IN ('ACCT-20260811150036', '121-cedar-lane', 'ACCT-20261009121405', 'ACCT-20261012154251');
-- The Anderson Firm P.C, 121 Cedar Lane, Institute of Neurological Care, Park Ridge Plaza

-- 2. Park Ridge Plaza's start date was saved as 0026-10-15 (a typo): 10/15/2026,
--    in the text, the date column and the account list row (position 2).
UPDATE accounts
SET start_date_raw = '10/15/2026',
    start_date = DATE '2026-10-15',
    unformatted = CASE WHEN jsonb_typeof(unformatted) = 'array' THEN jsonb_set(unformatted, '{2}', '"10/15/2026"'::jsonb) ELSE unformatted END
WHERE id = 'ACCT-20261012154251' AND start_date_raw = '0026-10-15';

-- 3. HAIGuard into the 8-step flow. Its Welcome Packet has not been sent
--    (no "Welcome packet sent to:" in its History), so it is on step 1.
--    Its sub is already assigned (Pancho), so steps 2 and 3 are marked done;
--    the flow skips them once the packet is sent (lib/pg/account-flow.ts advance).
INSERT INTO account_flows (account_id, account_name, manager, step, step_since, created_by, created_at)
SELECT a.id, btrim(a.account_name), COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw)),
       CASE WHEN EXISTS (SELECT 1 FROM activity_log l WHERE l.entity_type = 'account' AND l.entity_id = a.id AND l.detail LIKE 'Welcome packet sent to:%')
            THEN 'call' ELSE 'packet' END,
       now(), 'Moved from the old steps (migration 051)', a.created_at
FROM accounts a
LEFT JOIN managers m ON m.id = a.manager_id
WHERE a.id = 'ACCT-20261016140421'
ON CONFLICT (account_id) DO NOTHING;

INSERT INTO account_flow_events (account_id, step, action, by_name, note, at)
SELECT f.account_id, 'packet', 'start', 'Moved from the old steps (migration 051)', '', f.created_at
FROM account_flows f
WHERE f.account_id = 'ACCT-20261016140421'
  AND NOT EXISTS (SELECT 1 FROM account_flow_events e WHERE e.account_id = f.account_id AND e.action = 'start');

INSERT INTO account_flow_events (account_id, step, action, by_name, note)
SELECT f.account_id, s.step, 'done', 'Moved from the old steps (migration 051)', btrim(a.subcontractor_raw)
FROM account_flows f
JOIN accounts a ON a.id = f.account_id
CROSS JOIN (VALUES ('sub'), ('subOk')) AS s(step)
WHERE f.account_id = 'ACCT-20261016140421' AND btrim(a.subcontractor_raw) <> ''
  AND NOT EXISTS (SELECT 1 FROM account_flow_events e WHERE e.account_id = f.account_id AND e.step = s.step AND e.action = 'done');

-- Its pin becomes a flow pin (the tracker), still in the same square.
UPDATE handoff_items
SET data = data || '{"flow": "1"}'::jsonb,
    step = 'flow'
WHERE kind = 'account' AND item_id = 'ACCT-20261016140421' AND COALESCE(data ->> 'flow', '') = '';
