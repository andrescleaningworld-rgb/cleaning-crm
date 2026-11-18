-- 083: Customer portal "last seen" (lib/pg/portal-use.ts).
--
-- portal_seen: one row per account (location) a customer has opened in the
-- portal.
--   account_id     the account (accounts.id) the customer was looking at
--   email          the login that opened it
--   first_seen_at  the first portal page they opened for it
--   last_seen_at   the latest one, written at most once an hour
--   visits         roughly how many separate hours they came in
-- Staff "View as customer" previews are never written here.
--
-- Settings -> Customer Portal Access shows it as "Portal use". Nothing else
-- changes. The app works before this runs (no "Last seen" yet). Safe to run
-- twice.

CREATE TABLE IF NOT EXISTS portal_seen (
  account_id    TEXT PRIMARY KEY,
  email         TEXT NOT NULL DEFAULT '',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  visits        INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS portal_seen_last_idx ON portal_seen (last_seen_at DESC);
