-- Handoffs: who is waiting on whom, for the three things that used to travel
-- on paper between the office and the account managers.
--
--   kind 'account'  a new account going through the Onboarding Checklist
--   kind 'update'   an Account Update the office has to process
--   kind 'order'    a supply order: Ordered -> Approved -> Bought -> Delivered
--
-- These tables only add tracking next to what already exists. The checklist
-- items, the account updates and the supply orders themselves stay where
-- they are (Sheets / Apps Script or their own Postgres tables), so nothing
-- here is imported from or written to Google Sheets.

-- handoff_items: one row per thing being tracked, holding the step it is on
-- now and since when.
--   item_id     the account id, the account update id, or the supply order id
--   step        the step it is on now (see lib/handoffs.ts for the names)
--   step_since  when it arrived on that step; "late" is counted from here
--   manager     the account's manager (a name), who owns the manager steps
--   data        what the lists need to show without loading the source:
--               account: { acceptedOn, estimateUrl, estimateName }
--               update:  { updateType, notes, date }
--               order:   { items, subcontractor }
--   done_at     set when the last step is reached
CREATE TABLE IF NOT EXISTS handoff_items (
  kind         TEXT NOT NULL CHECK (kind IN ('account', 'update', 'order')),
  item_id      TEXT NOT NULL,
  title        TEXT NOT NULL DEFAULT '',
  account_id   TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  manager      TEXT NOT NULL DEFAULT '',
  step         TEXT NOT NULL,
  step_since   TIMESTAMPTZ NOT NULL DEFAULT now(),
  data         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  done_at      TIMESTAMPTZ,
  PRIMARY KEY (kind, item_id)
);

CREATE INDEX IF NOT EXISTS handoff_items_open_idx ON handoff_items (kind, step_since) WHERE done_at IS NULL;

-- handoff_events: every move from one step to the next: who, when, and the
-- optional note ("Processed by Maria, Oct 8").
CREATE TABLE IF NOT EXISTS handoff_events (
  id        BIGSERIAL PRIMARY KEY,
  kind      TEXT NOT NULL,
  item_id   TEXT NOT NULL,
  from_step TEXT NOT NULL DEFAULT '',
  to_step   TEXT NOT NULL,
  by_name   TEXT NOT NULL DEFAULT '',
  note      TEXT NOT NULL DEFAULT '',
  at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS handoff_events_item_idx ON handoff_events (kind, item_id, at DESC);

-- handoff_settings: Settings -> Team. One row.
--   office_owners   the people (manager names) who own the Office steps
--   red_after_days  days on one step before an update or an order turns red
--   onboarding      per checklist section: { "<sectionKey>": { "owner": "office" | "manager", "days": N } }
--                   (days = due this many days after the estimate was accepted).
--                   Empty = the defaults in lib/handoffs.ts.
CREATE TABLE IF NOT EXISTS handoff_settings (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  office_owners  TEXT[] NOT NULL DEFAULT '{}',
  red_after_days INTEGER NOT NULL DEFAULT 2 CHECK (red_after_days BETWEEN 1 AND 30),
  onboarding     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by     TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO handoff_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
