-- Pin Board: how many days a finished paper stays in the Done tray before it
-- moves to the Archive. Postgres only. It only adds one column. Idempotent.
-- Never edit after applying.
--
-- A paper is never deleted. "Done" stamps board_done_at on its row; the Done
-- tray shows the ones stamped in the last done_days days, the Archive shows
-- the older ones, and "Put back on the board" clears the stamp.
ALTER TABLE board_settings ADD COLUMN IF NOT EXISTS done_days INTEGER NOT NULL DEFAULT 7;
