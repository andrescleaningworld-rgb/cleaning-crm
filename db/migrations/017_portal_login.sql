-- Customer portal redesign: email + password login, test accounts, and the
-- "Portal open to customers" setting. Idempotent. Never edit after applying.
--
-- These tables are born in Postgres: nothing here comes from Google Sheets
-- and nothing is ever written back to it.

-- portal_users: one row per email that has set a password.
--   email          lower case, trimmed. It is the email on one or more
--                  accounts (accounts.email); which accounts a login may
--                  open is worked out at login, not stored here.
--   password_hash  bcrypt. The password itself is never stored or logged.
--   failed_attempts / locked_until   5 wrong tries lock the login for 15
--                  minutes.
CREATE TABLE IF NOT EXISTS portal_users (
  id              BIGSERIAL PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- portal_tokens: the "Set your password" / "Forgot password" links.
--   token_hash  SHA-256 of the token in the link. The token itself is only
--               ever in the email (or on screen for a test account).
--   kind        'set' (first time, or a staff invite) or 'reset'.
--   Valid 24 hours, usable once.
CREATE TABLE IF NOT EXISTS portal_tokens (
  id         BIGSERIAL PRIMARY KEY,
  email      TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  kind       TEXT NOT NULL CHECK (kind IN ('set', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_tokens_email_idx ON portal_tokens (email, created_at DESC);

-- portal_settings: switches for the portal as a whole.
--   open_to_customers  'false' until Andres opens the portal. While it is
--                      'false' only test accounts can log in, set a
--                      password or be invited.
CREATE TABLE IF NOT EXISTS portal_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO portal_settings (key, value) VALUES ('open_to_customers', 'false') ON CONFLICT (key) DO NOTHING;

-- A test account exists only in Postgres (never in Sheets). It is left out
-- of every staff list, report, map and total; only the customer portal
-- reads it.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS is_test BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS accounts_email_idx ON accounts (lower(btrim(email)));

-- Portal codes used to be the Account ID. A code that was replaced by a
-- random one is marked, so a later import from Sheets leaves it alone and
-- the verify step knows the difference is on purpose.
ALTER TABLE portal_access ADD COLUMN IF NOT EXISTS portal_code_randomized_at TIMESTAMPTZ;
