-- 057: "At risk" accounts (lib/pg/account-risk.ts). The flag itself is worked
-- out fresh from complaints, visits and the sub's score each time a screen
-- asks; this table only remembers what it was at the last daily check, so a
-- red account gets ONE paper in its manager's square when it turns red, and
-- the paper comes down when it is no longer red.
--
-- account_risk_flags   one row per active account: level (green / yellow /
--                      red), the one-line reason, and since when it is red.
--
-- Running it again changes nothing. The thresholds are in feature_settings
-- (migration 056), key 'atRisk'.

CREATE TABLE IF NOT EXISTS account_risk_flags (
  account_id  TEXT PRIMARY KEY,
  level       TEXT NOT NULL CHECK (level IN ('green', 'yellow', 'red')),
  reason      TEXT NOT NULL DEFAULT '',
  red_since   TIMESTAMPTZ,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
