-- The Office Pin Board (/board): the papers that used to hang on the real
-- cork board. Postgres only. Nothing here is imported from or written to
-- Google Sheets.
--
-- A paper is a handoff_items row (migration 018), so a new account or an
-- extra job is the same row on the board and in the handoff lists. Three more kinds are board-only:
--   'complaint'  an open complaint (item_id = the Complaint ID)
--   'supply'     one whole supply order, however many items it has (the
--                handoff kind 'order' tracks each item line on its own)
--   'note'       a sticky note / to-do someone pinned by hand
ALTER TABLE handoff_items DROP CONSTRAINT IF EXISTS handoff_items_kind_check;
ALTER TABLE handoff_items ADD CONSTRAINT handoff_items_kind_check CHECK (kind IN ('account', 'update', 'order', 'issue', 'extra', 'complaint', 'supply', 'note'));

-- Where the paper hangs and who has it:
--   board_square     '' = the shared square for its kind; otherwise the Staff
--                    ID of the manager whose square it was dragged into
--   board_pinned_at  when it went up on the board; "X days" is counted from
--                    here. NULL = not a board paper (an account update, a
--                    sub's problem report)
--   taken_by / taken_at   who tapped "Got it" (red pin -> green pin)
--   board_done_at / board_done_by   unpinned into the Done tray: when, who
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_square TEXT NOT NULL DEFAULT '';
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_pinned_at TIMESTAMPTZ;
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS taken_by TEXT NOT NULL DEFAULT '';
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS taken_at TIMESTAMPTZ;
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_done_at TIMESTAMPTZ;
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_done_by TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS handoff_items_board_idx ON handoff_items (board_pinned_at) WHERE board_pinned_at IS NOT NULL AND board_done_at IS NULL;

-- board_settings: one row.
--   old_after_days  days on the board before a paper turns yellow, curls and
--                   gets the red "X days" tag
CREATE TABLE IF NOT EXISTS board_settings (
  id             BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  old_after_days INTEGER NOT NULL DEFAULT 3 CHECK (old_after_days BETWEEN 1 AND 60),
  updated_by     TEXT NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO board_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- board_tv_links: the secret links that open Office TV mode without a login.
-- Only the SHA-256 of a link's token is stored, so a link can be shown once
-- (when it is made) and never read back. Revoked links stay as history.
CREATE TABLE IF NOT EXISTS board_tv_links (
  id           BIGSERIAL PRIMARY KEY,
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL DEFAULT '',
  created_by   TEXT NOT NULL DEFAULT '',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  revoked_by   TEXT NOT NULL DEFAULT ''
);

-- cleaning_marks: a manager's own answer for one account on one day, for the
-- Cleaning calendar: 'cleaned' or 'missed'. One answer per account and day;
-- a later tap replaces the earlier one.
CREATE TABLE IF NOT EXISTS cleaning_marks (
  account_id   TEXT NOT NULL,
  day          DATE NOT NULL,
  mark         TEXT NOT NULL CHECK (mark IN ('cleaned', 'missed')),
  account_name TEXT NOT NULL DEFAULT '',
  marked_by    TEXT NOT NULL DEFAULT '',
  marked_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, day)
);

CREATE INDEX IF NOT EXISTS cleaning_marks_day_idx ON cleaning_marks (day);
