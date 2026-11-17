-- 081: CW Now (Crew Link) — the crew list and the send log
-- (lib/pg/crew-link-people.ts, the account's CW Now card).
--
-- crew_link_people   the people on an account's crew: name, phone, language
--                    (en / es / pt: the message they get, and the language the
--                    link opens in), and an optional checklist tab of their own
--                    (checklist_tabs.id, "Person 1"; the link opens on it).
--                    Removing a person sets deleted_at (their send log stays).
-- crew_link_sends    one row each time the office sends a person their link:
--                    when, by whom, how ('whatsapp' / 'copy' / 'phone' /
--                    'print'). "Sent Nov 17 by Maria" and "Send again".
--
-- Nothing else changes: the crew link itself (/porter/<code>), the tabs and
-- the submissions are as before. The app works before this runs (no crew
-- list, the card says so). Safe to run twice.

CREATE TABLE IF NOT EXISTS crew_link_people (
  id          BIGSERIAL PRIMARY KEY,
  account_id  TEXT NOT NULL,
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  language    TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es', 'pt')),
  tab_id      INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS crew_link_people_account_idx ON crew_link_people (account_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS crew_link_sends (
  id          BIGSERIAL PRIMARY KEY,
  person_id   BIGINT NOT NULL REFERENCES crew_link_people (id) ON DELETE CASCADE,
  account_id  TEXT NOT NULL,
  method      TEXT NOT NULL DEFAULT 'whatsapp' CHECK (method IN ('whatsapp', 'copy', 'phone', 'print')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by     TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS crew_link_sends_person_idx ON crew_link_sends (person_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS crew_link_sends_account_idx ON crew_link_sends (account_id, sent_at DESC);
