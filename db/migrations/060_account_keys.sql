-- 060: account keys (the Keys tab in Accounts Center).
--
--   key_code             the code on the key tag, "" = none. The Keys tab's
--                        "Generate code" makes a random one that no other
--                        account has; the index below makes a double sure.
--   key_holder           who holds the physical key, as shown and typed. "" = nobody.
--   key_holder_sub_id    set when key_holder is exactly one sub's name.
--   key_holder_staff_id  set when key_holder is exactly one staff member's name.
--                        Both NULL: the name is kept as typed, linked to no one.
--
-- Whether there is a copy stays in the existing has_key ("Yes" / "No").
-- Not sheet columns, so not part of `unformatted`. Staff only: never sent
-- to the sub portal or the customer portal.
--
-- Schema only, no data change. Running it again changes nothing.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS key_code TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS key_holder TEXT NOT NULL DEFAULT '';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS key_holder_sub_id TEXT REFERENCES subcontractors (id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS key_holder_staff_id TEXT REFERENCES staff (id) ON DELETE SET NULL;

-- One account per code. Upper and lower case count as the same code, so two
-- tags can never be told apart only by case.
CREATE UNIQUE INDEX IF NOT EXISTS accounts_key_code_unique ON accounts (upper(key_code)) WHERE key_code <> '';
