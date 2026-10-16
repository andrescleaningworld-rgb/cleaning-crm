-- 044: "Delete account" (account page → More) and Settings → Deleted accounts
-- (lib/pg/account-delete.ts).
--
-- A soft delete, like a deleted supply order (041): the account row and
-- everything that points at it stay, marked deleted, with who did it, when
-- and why. Every list leaves a deleted account out (and, like a test
-- account, its visits, complaints, to-dos, schedules and supply orders);
-- its customer portal login and its Crew Link stop working. "Restore" in
-- Settings clears the mark and it all comes back.
--
-- Only adds: three columns, empty by default. The code reads deleted_at
-- through to_jsonb(), so it works before and after this migration.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_by TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS deleted_reason TEXT NOT NULL DEFAULT '';
