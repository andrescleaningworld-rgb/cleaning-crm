-- 046: the New Account procedure, Part B: the 8-step flow with its "pizza
-- tracker". Postgres only. Nothing here is imported from or written to
-- Google Sheets, and no existing row is changed.
--
-- Only an account made with the office form "New Accepted Account" gets a
-- row here, so every account that exists today has no tracker. The steps,
-- in order (lib/accountFlow.ts has the words):
--   packet       1 Send welcome packet        done when History shows it was sent
--   sub          2 Choose subcontractor
--   subOk        3 Sub confirms               the offer waits in the sub portal
--   call         4 Contact customer
--   survey       5 Site survey + onboarding   done when the Onboarding Checklist is
--   walkthrough  6 Crew walkthrough
--   startDate    7 Confirm start date         saves the account's Start Date
--   followUp     8 Follow up after first cleaning
--   live         finished: status Active, the pin is in the Done tray
--
-- account_flows: one row per new account, holding the step it is on now.
--   step_since       when it arrived on this step; "red after 2 business
--                    days" is counted from here (step 8: from its due day)
--   offer_*          the offer the sub sees in their portal (step 3): who,
--                    which days, what time, how long
--   follow_up_due    step 8 is due the day after the start date
--   stuck_note       the manager's note on why the current step is stuck,
--                    cleared when the step moves (the events keep it)
CREATE TABLE IF NOT EXISTS account_flows (
  account_id       TEXT PRIMARY KEY,
  account_name     TEXT NOT NULL DEFAULT '',
  manager          TEXT NOT NULL DEFAULT '',
  step             TEXT NOT NULL DEFAULT 'packet'
                   CHECK (step IN ('packet', 'sub', 'subOk', 'call', 'survey', 'walkthrough', 'startDate', 'followUp', 'live')),
  step_since       TIMESTAMPTZ NOT NULL DEFAULT now(),
  estimate_url     TEXT NOT NULL DEFAULT '',
  estimate_name    TEXT NOT NULL DEFAULT '',
  offer_sub_id     TEXT NOT NULL DEFAULT '',
  offer_sub_name   TEXT NOT NULL DEFAULT '',
  offer_sub_email  TEXT NOT NULL DEFAULT '',
  offer_days       TEXT NOT NULL DEFAULT '',
  offer_start      TEXT NOT NULL DEFAULT '',
  offer_minutes    INTEGER,
  offer_sent_at    TIMESTAMPTZ,
  follow_up_due    DATE,
  stuck_note       TEXT NOT NULL DEFAULT '',
  stuck_note_by    TEXT NOT NULL DEFAULT '',
  stuck_note_at    TIMESTAMPTZ,
  created_by       TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at          TIMESTAMPTZ
);

-- The sub portal asks "which offers are waiting for me?".
CREATE INDEX IF NOT EXISTS account_flows_offer_idx ON account_flows (offer_sub_id) WHERE step = 'subOk';

-- account_flow_events: who did what on which step, and when.
--   action  start  the account was made with the form
--           done   the step was finished (note = the follow-up note on step 8)
--           offer  the offer went to a sub (note = the sub)
--           yes    the sub said "Yes, I can do it"
--           no     the sub said "No, I can't"; the flow went back to step 2
--           back   someone took the offer back to pick another sub
--           note   a note on why the step is stuck
CREATE TABLE IF NOT EXISTS account_flow_events (
  id          BIGSERIAL PRIMARY KEY,
  account_id  TEXT NOT NULL,
  step        TEXT NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('start', 'done', 'offer', 'yes', 'no', 'back', 'note')),
  by_name     TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_flow_events_account_idx ON account_flow_events (account_id, at DESC);

-- ---------- Accounts made from October 19, 2026 on ----------
-- They were made before the form existed, so they get the tracker here,
-- with the steps marked done that the app can tell are done:
--   1 packet  done when History has "Welcome packet sent to: ..." (who and when come from there)
--   2 + 3     done when the account already has a subcontractor
-- Step 4 (contact customer) cannot be read from anything, so a flow stops
-- there at the latest. The account's Status is not changed. Accounts that
-- are cancelled, deleted or already in the flow are left out. Running this
-- again adds nothing.
INSERT INTO account_flows (account_id, account_name, manager, step, step_since, created_by, created_at)
SELECT a.id,
       btrim(a.account_name),
       COALESCE(NULLIF(btrim(m.name), ''), btrim(a.manager_raw)),
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM activity_log l WHERE l.entity_type = 'account' AND l.entity_id = a.id AND l.detail LIKE 'Welcome packet sent to:%') THEN 'packet'
         WHEN btrim(a.subcontractor_raw) = '' THEN 'sub'
         ELSE 'call'
       END,
       now(),
       'Set up by migration 046',
       a.created_at
FROM accounts a
LEFT JOIN managers m ON m.id = a.manager_id
WHERE a.id IS NOT NULL
  AND btrim(a.account_name) <> ''
  AND a.created_at >= TIMESTAMPTZ '2026-10-19 00:00:00 America/New_York'
  AND a.status_key NOT IN ('cancelled', 'canceled')
  AND (to_jsonb(a)->>'deleted_at') IS NULL
ON CONFLICT (account_id) DO NOTHING;

-- Who did what for those flows: the start, and each step marked done above.
INSERT INTO account_flow_events (account_id, step, action, by_name, note, at)
SELECT f.account_id, 'packet', 'start', 'Set up by migration 046', '', f.created_at
FROM account_flows f
WHERE f.created_by = 'Set up by migration 046'
  AND NOT EXISTS (SELECT 1 FROM account_flow_events e WHERE e.account_id = f.account_id);

INSERT INTO account_flow_events (account_id, step, action, by_name, note, at)
SELECT f.account_id, 'packet', 'done', COALESCE(NULLIF(btrim(l.actor_name), ''), 'Welcome Packet'), '', l.created_at
FROM account_flows f
JOIN LATERAL (
  SELECT actor_name, created_at FROM activity_log
  WHERE entity_type = 'account' AND entity_id = f.account_id AND detail LIKE 'Welcome packet sent to:%'
  ORDER BY created_at ASC LIMIT 1
) l ON true
WHERE f.created_by = 'Set up by migration 046' AND f.step IN ('sub', 'call')
  AND NOT EXISTS (SELECT 1 FROM account_flow_events e WHERE e.account_id = f.account_id AND e.step = 'packet' AND e.action = 'done');

INSERT INTO account_flow_events (account_id, step, action, by_name, note)
SELECT f.account_id, s.step, 'done', 'Set up by migration 046', btrim(a.subcontractor_raw)
FROM account_flows f
JOIN accounts a ON a.id = f.account_id
CROSS JOIN (VALUES ('sub'), ('subOk')) AS s(step)
WHERE f.created_by = 'Set up by migration 046' AND f.step = 'call'
  AND NOT EXISTS (SELECT 1 FROM account_flow_events e WHERE e.account_id = f.account_id AND e.step = s.step AND e.action = 'done');

-- Their pin: the account's paper on the Pin Board, marked as a flow paper and
-- put back up if the board had taken it down. A new paper goes in the
-- manager's square when they have one, else the shared "New accepted" square.
INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, data, created_by, board_pinned_at, board_square)
SELECT 'account', f.account_id, f.account_name, f.account_id, f.account_name, f.manager, 'flow',
       jsonb_build_object('flow', '1', 'acceptedOn', to_char(f.created_at AT TIME ZONE 'America/New_York', 'YYYY-MM-DD')),
       'Set up by migration 046', now(),
       COALESCE((
         SELECT s.id FROM staff s
         WHERE s.role = 'Manager' AND s.active AND btrim(s.name) <> '' AND lower(btrim(s.name)) <> 'cw'
           AND lower(btrim(s.name)) = lower(btrim(f.manager))
         ORDER BY s.id LIMIT 1
       ), '')
FROM account_flows f
WHERE f.created_by = 'Set up by migration 046'
ON CONFLICT (kind, item_id) DO UPDATE SET
  data = handoff_items.data || '{"flow": "1"}'::jsonb,
  step = 'flow',
  done_at = NULL,
  board_pinned_at = COALESCE(handoff_items.board_pinned_at, now()),
  board_done_at = NULL,
  board_done_by = '';
