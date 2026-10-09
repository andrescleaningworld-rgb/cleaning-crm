-- The simple sub portal home: PIN login, site photos, and two more kinds of
-- handoff (a problem a sub reports, an extra job a sub asks for).
-- Postgres only. Nothing here is imported from or written to Google Sheets.

-- Two more kinds on handoff_items:
--   'issue'  a problem a subcontractor reported: Reported -> Handled (manager)
--   'extra'  an extra job a subcontractor asked for:
--            Received -> Approved -> Done (office)
-- data for both: { notes, photoUrl, sub, subEmail, problemType }
ALTER TABLE handoff_items DROP CONSTRAINT IF EXISTS handoff_items_kind_check;
ALTER TABLE handoff_items ADD CONSTRAINT handoff_items_kind_check CHECK (kind IN ('account', 'update', 'order', 'issue', 'extra'));

-- sub_pins: a subcontractor's 4-digit PIN (bcrypt hash; the PIN itself is
-- never stored or logged). 5 wrong tries lock it for 15 minutes.
CREATE TABLE IF NOT EXISTS sub_pins (
  email        TEXT PRIMARY KEY,
  pin_hash     TEXT NOT NULL,
  tries        INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- sub_setup_links: the personal link a sub gets by text to pick a PIN.
-- Only the SHA-256 of the link's token is stored. Valid 7 days, works once.
CREATE TABLE IF NOT EXISTS sub_setup_links (
  token_hash TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at    TIMESTAMPTZ,
  created_by TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_setup_links_email_idx ON sub_setup_links (email, created_at DESC);

-- sub_site_photos: before / after photos a sub takes at a site from the
-- portal home. The file is in Blob storage (sub-photos/); this row says
-- whose it is and which site.
CREATE TABLE IF NOT EXISTS sub_site_photos (
  id           BIGSERIAL PRIMARY KEY,
  sub_email    TEXT NOT NULL,
  sub_name     TEXT NOT NULL DEFAULT '',
  account_id   TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  moment       TEXT NOT NULL DEFAULT 'after' CHECK (moment IN ('before', 'after')),
  url          TEXT NOT NULL,
  taken_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_site_photos_account_idx ON sub_site_photos (account_id, taken_at DESC);
CREATE INDEX IF NOT EXISTS sub_site_photos_sub_idx ON sub_site_photos (sub_email, taken_at DESC);
