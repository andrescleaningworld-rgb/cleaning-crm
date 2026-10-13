-- Accounts: more than one contact, each with a role. Postgres only. It only
-- adds one table and its rows: no column or table is removed and no account
-- row is rewritten. Idempotent. Never edit after applying.
--
-- The account's own three fields (accounts.contact_name, phone, email) stay
-- exactly as they are and stay the truth for the MAIN contact: the customer
-- portal login, Missing emails, the work order and everything else keep
-- reading them. The app reads the main contact from those fields and writes
-- them, through the account's usual save, whenever the main contact is
-- edited or a different contact is made the main one (lib/pg/account-contacts.ts).
--
-- A contact that is removed is only hidden (removed_at): nothing is deleted.

CREATE TABLE IF NOT EXISTS account_contacts (
  id         BIGSERIAL   PRIMARY KEY,
  account_id TEXT        NOT NULL REFERENCES accounts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name       TEXT        NOT NULL DEFAULT '',
  role       TEXT        NOT NULL DEFAULT '',
  phone      TEXT        NOT NULL DEFAULT '',
  email      TEXT        NOT NULL DEFAULT '',
  notes      TEXT        NOT NULL DEFAULT '',
  is_main    BOOLEAN     NOT NULL DEFAULT false,
  created_by TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT        NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  removed_by TEXT        NOT NULL DEFAULT '',
  removed_at TIMESTAMPTZ
);

-- At most one main contact for an account.
CREATE UNIQUE INDEX IF NOT EXISTS account_contacts_one_main ON account_contacts (account_id) WHERE is_main AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS account_contacts_account_idx ON account_contacts (account_id);

-- Every account's contact of today becomes its first contact, marked main.
-- An account with no name, phone or email gets none. Run twice, it adds
-- nothing: an account that already has a contact row is skipped.
INSERT INTO account_contacts (account_id, name, role, phone, email, is_main, created_by)
SELECT a.id, btrim(COALESCE(a.contact_name, '')), 'Main contact', btrim(COALESCE(a.phone, '')), btrim(COALESCE(a.email, '')), true, 'migration 034'
FROM accounts a
WHERE a.id IS NOT NULL
  AND (btrim(COALESCE(a.contact_name, '')) <> '' OR btrim(COALESCE(a.phone, '')) <> '' OR btrim(COALESCE(a.email, '')) <> '')
  AND NOT EXISTS (SELECT 1 FROM account_contacts c WHERE c.account_id = a.id);
