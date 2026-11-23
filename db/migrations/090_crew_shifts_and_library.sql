-- 090: CW Now shifts and the checklist library (lib/pg/crew-shifts.ts,
-- lib/pg/checklist-library.ts). Only adds tables. No row changes. The app works
-- before this runs (the shift card and saved templates say they are not on yet).
-- Safe to run twice.
--
-- crew_shifts         one per account: the shift's start and end time ('HH:MM',
--                     New York) and its "text the crew at shift start" switch.
--                     Which days it runs comes from the cleaning schedule.
-- crew_shift_texts    one row per person, per account, per shift day: a person
--                     can never get the same shift text twice.
-- checklist_library   checklists saved to reuse on other accounts.

CREATE TABLE IF NOT EXISTS crew_shifts (
  account_id  TEXT PRIMARY KEY,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  text_on     BOOLEAN NOT NULL DEFAULT false,
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS crew_shift_texts (
  account_id  TEXT NOT NULL,
  day         DATE NOT NULL,
  person_id   BIGINT NOT NULL REFERENCES crew_link_people (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'sending',
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, day, person_id)
);

CREATE TABLE IF NOT EXISTS checklist_library (
  id          BIGSERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by  TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS checklist_library_name_idx ON checklist_library (lower(btrim(name))) WHERE deleted_at IS NULL;
