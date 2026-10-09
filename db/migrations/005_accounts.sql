-- Area 4 – Accounts, OnboardingChecklist, Account Updates, Sub Transfer
-- Proposals. Idempotent. Never edit after applying.
--
-- SECRETS in accounts: key_alarm_access_info, alarm_code, monthly_revenue,
-- monthly_sub_pay, gross_margin, gross_margin_pct. Code that reads this
-- table must hand them only to the callers that get them today (staff
-- routes; never the customer portal, never a subcontractor other than the
-- key/alarm info for their own accounts). Reports never print them.

-- pk is the row's own key. id is the Account ID as typed in Sheets: UNIQUE,
-- but NULL when the sheet row has none (one such row exists), so other
-- tables can point at accounts(id) and a row without an ID is still kept.
CREATE TABLE IF NOT EXISTS accounts (
  pk                       BIGSERIAL PRIMARY KEY,
  id                       TEXT UNIQUE,
  legacy_key               TEXT NOT NULL UNIQUE,
  account_name             TEXT NOT NULL DEFAULT '',
  start_date               DATE,
  start_date_raw           TEXT NOT NULL DEFAULT '',
  service_type             TEXT NOT NULL DEFAULT '',
  frequency                TEXT NOT NULL DEFAULT '',
  cleaning_days            TEXT NOT NULL DEFAULT '',
  key_alarm_access_info    TEXT NOT NULL DEFAULT '',
  monthly_revenue          NUMERIC(12, 2),
  monthly_revenue_raw      TEXT NOT NULL DEFAULT '',
  -- Free text in Sheets. subcontractor_id is set only when the name resolves
  -- to exactly one sub by the app's own matching rule
  -- (lib/subAccountMatching.ts) or by an override; otherwise NULL + a
  -- question in migration_issues.
  subcontractor_id         TEXT REFERENCES subcontractors (id) ON DELETE SET NULL,
  subcontractor_raw        TEXT NOT NULL DEFAULT '',
  manager_id               BIGINT REFERENCES managers (id) ON DELETE SET NULL,
  manager_raw              TEXT NOT NULL DEFAULT '',
  monthly_sub_pay          NUMERIC(12, 2),
  monthly_sub_pay_raw      TEXT NOT NULL DEFAULT '',
  address                  TEXT NOT NULL DEFAULT '',
  contact_name             TEXT NOT NULL DEFAULT '',
  phone                    TEXT NOT NULL DEFAULT '',
  scope_of_work            TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  -- As typed ("Active", "ACTIVE", "Cancelled", …). status_key is the same
  -- text trimmed and lower-cased, for counting and filtering.
  status                   TEXT NOT NULL DEFAULT '',
  status_key               TEXT NOT NULL DEFAULT '',
  cancelled_date           DATE,
  cancelled_date_raw       TEXT NOT NULL DEFAULT '',
  last_updated_raw         TEXT NOT NULL DEFAULT '',
  account_health           TEXT NOT NULL DEFAULT '',
  email                    TEXT NOT NULL DEFAULT '',
  gross_margin             NUMERIC(12, 2),
  gross_margin_raw         TEXT NOT NULL DEFAULT '',
  gross_margin_pct_raw     TEXT NOT NULL DEFAULT '',
  last_visit_date_raw      TEXT NOT NULL DEFAULT '',
  last_complaint_date_raw  TEXT NOT NULL DEFAULT '',
  last_follow_up_date_raw  TEXT NOT NULL DEFAULT '',
  open_complaints_raw      TEXT NOT NULL DEFAULT '',
  open_inactive_notes      TEXT NOT NULL DEFAULT '',
  latitude                 DOUBLE PRECISION,
  latitude_raw             TEXT NOT NULL DEFAULT '',
  longitude                DOUBLE PRECISION,
  longitude_raw            TEXT NOT NULL DEFAULT '',
  -- "Yes" / "No" / blank, kept as typed: blank means "not recorded".
  has_key                  TEXT NOT NULL DEFAULT '',
  alarm_code               TEXT NOT NULL DEFAULT '',
  city                     TEXT NOT NULL DEFAULT '',
  zip                      TEXT NOT NULL DEFAULT '',
  checklist_needed         TEXT NOT NULL DEFAULT '',
  source_sheet             TEXT,
  source_row               INTEGER,
  imported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS accounts_name_idx ON accounts (lower(account_name));
CREATE INDEX IF NOT EXISTS accounts_status_idx ON accounts (status_key);
CREATE INDEX IF NOT EXISTS accounts_sub_idx ON accounts (subcontractor_id);

-- One checklist per account (keyed by the Account ID text; not a foreign key
-- so a checklist for an ID that was later retyped is not lost).
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  account_id                 TEXT PRIMARY KEY,
  legacy_key                 TEXT NOT NULL UNIQUE,
  account_name               TEXT NOT NULL DEFAULT '',
  items                      JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_raw                  TEXT NOT NULL DEFAULT '',
  started_at                 TIMESTAMPTZ,
  started_at_raw             TEXT NOT NULL DEFAULT '',
  last_updated_at            TIMESTAMPTZ,
  last_updated_at_raw        TEXT NOT NULL DEFAULT '',
  completed_at               TIMESTAMPTZ,
  completed_at_raw           TEXT NOT NULL DEFAULT '',
  auto_stable_applied_at     TIMESTAMPTZ,
  auto_stable_applied_at_raw TEXT NOT NULL DEFAULT '',
  source_sheet               TEXT,
  source_row                 INTEGER,
  imported_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Notes about an account. In Sheets the Update ID and Account ID columns are
-- formulas that number rows (so they are not ids) and are empty on most
-- rows; the account is named in free text. account_pk is set only when the
-- name matches exactly one account.
CREATE TABLE IF NOT EXISTS account_updates (
  id                       BIGSERIAL PRIMARY KEY,
  legacy_key               TEXT NOT NULL UNIQUE,
  update_id_raw            TEXT NOT NULL DEFAULT '',
  account_id_raw           TEXT NOT NULL DEFAULT '',
  account_pk               BIGINT REFERENCES accounts (pk) ON DELETE SET NULL,
  account_name             TEXT NOT NULL DEFAULT '',
  update_date              DATE,
  update_date_raw          TEXT NOT NULL DEFAULT '',
  update_type              TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  created_by               TEXT NOT NULL DEFAULT '',
  notify_email             TEXT NOT NULL DEFAULT '',
  created_at_raw           TEXT NOT NULL DEFAULT '',
  updated_at_raw           TEXT NOT NULL DEFAULT '',
  update_title             TEXT NOT NULL DEFAULT '',
  details                  TEXT NOT NULL DEFAULT '',
  entered_by               TEXT NOT NULL DEFAULT '',
  notify_office            TEXT NOT NULL DEFAULT '',
  notify_subcontractor     TEXT NOT NULL DEFAULT '',
  follow_up_needed         TEXT NOT NULL DEFAULT '',
  follow_up_date_raw       TEXT NOT NULL DEFAULT '',
  source_sheet             TEXT,
  source_row               INTEGER,
  imported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_updates_account_idx ON account_updates (account_pk);
CREATE INDEX IF NOT EXISTS account_updates_name_idx ON account_updates (lower(account_name));

-- An offer to move accounts to another sub. One proposal (proposal_id) is
-- several rows, one per account. keys_alarm and proposed_monthly_pay are
-- sensitive (see the note at the top).
CREATE TABLE IF NOT EXISTS sub_transfer_proposals (
  id                       BIGSERIAL PRIMARY KEY,
  legacy_key               TEXT NOT NULL UNIQUE,
  proposal_id              TEXT NOT NULL DEFAULT '',
  created_at_raw           TEXT NOT NULL DEFAULT '',
  status                   TEXT NOT NULL DEFAULT '',
  new_subcontractor        TEXT NOT NULL DEFAULT '',
  new_subcontractor_email  TEXT NOT NULL DEFAULT '',
  new_subcontractor_id     TEXT REFERENCES subcontractors (id) ON DELETE SET NULL,
  account_name             TEXT NOT NULL DEFAULT '',
  account_pk               BIGINT REFERENCES accounts (pk) ON DELETE SET NULL,
  address                  TEXT NOT NULL DEFAULT '',
  cleaning_days            TEXT NOT NULL DEFAULT '',
  scope                    TEXT NOT NULL DEFAULT '',
  keys_alarm               TEXT NOT NULL DEFAULT '',
  proposed_monthly_pay     NUMERIC(12, 2),
  proposed_monthly_pay_raw TEXT NOT NULL DEFAULT '',
  accepted_at_raw          TEXT NOT NULL DEFAULT '',
  declined_at_raw          TEXT NOT NULL DEFAULT '',
  notes                    TEXT NOT NULL DEFAULT '',
  sent_at_raw              TEXT NOT NULL DEFAULT '',
  source_sheet             TEXT,
  source_row               INTEGER,
  imported_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sub_transfer_proposals_proposal_idx ON sub_transfer_proposals (proposal_id);
