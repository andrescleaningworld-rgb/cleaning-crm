-- 062: Pin Board status check. Postgres only.
--
-- A pin that sits 2 business days with no update gets a "Status needed" tag,
-- and whoever has it (who took it with "Got it", else the manager whose
-- square it is in) gets a text and a push asking for a status. The ask
-- repeats every 2 business days; on the third unanswered ask the owner
-- (manager_accounts role 'owner') is told too, once. The daily-reminders
-- cron does the asking (lib/pg/pin-status.ts).
--
-- handoff_items (the papers, migration 020):
--   board_status          the latest status: on_it, waiting_customer,
--                         waiting_sub, done. '' = none yet.
--   board_status_note     the short note given with it.
--   board_status_by       who gave it (their name).
--   board_status_at       when. Any status resets the clock and the asks.
--   board_owner_since     when the paper last changed hands (moved to
--                         another square, taken, given back): the clock
--                         starts again then too. NULL = since it was pinned.
--   board_asks            how many times it was asked with no answer since
--                         the last update. > 0 = "Status needed".
--   board_asked_at        the last ask.
--   board_owner_told_at   when the owner was told about this stretch of
--                         silence. NULL again after the next status.
--
-- board_status_log: every status, ask and owner notice, for the pin's
-- history. Kept after the paper comes down.
--
-- Schema only, no data change. Running it again changes nothing.
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_status TEXT NOT NULL DEFAULT '';
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_status_note TEXT NOT NULL DEFAULT '';
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_status_by TEXT NOT NULL DEFAULT '';
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_status_at TIMESTAMPTZ;
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_owner_since TIMESTAMPTZ;
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_asks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_asked_at TIMESTAMPTZ;
ALTER TABLE handoff_items ADD COLUMN IF NOT EXISTS board_owner_told_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS board_status_log (
  id       BIGSERIAL PRIMARY KEY,
  kind     TEXT NOT NULL,
  item_id  TEXT NOT NULL,
  -- status: someone gave a status. ask: the board asked for one. owner: the owner was told.
  event    TEXT NOT NULL CHECK (event IN ('status', 'ask', 'owner')),
  status   TEXT NOT NULL DEFAULT '',
  note     TEXT NOT NULL DEFAULT '',
  -- Who gave the status; for an ask or notice, who was asked or told ('' = nobody, a shared box).
  by_name  TEXT NOT NULL DEFAULT '',
  at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS board_status_log_item_idx ON board_status_log (kind, item_id, at);
