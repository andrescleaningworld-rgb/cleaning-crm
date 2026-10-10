-- Pin Board: "Pin to board" as a setting. Postgres only.
--
-- One more column on the board's one-row settings table:
--   pin_types  per record type, whether its screens offer "Pin to board" and
--              whether a new record is pinned by default:
--              { "todo": { "show": true, "pinned": false }, "visit": { ... } }
--              A type that is not in here uses the defaults in
--              lib/boardPins.ts (To-dos shown and not pinned by default;
--              everything else off).
ALTER TABLE board_settings ADD COLUMN IF NOT EXISTS pin_types JSONB NOT NULL DEFAULT '{}'::jsonb;
