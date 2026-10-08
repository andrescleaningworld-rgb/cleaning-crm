-- Area 11 – Customer portal: customer-portal, portal-complaints,
-- portal-service-requests, portal-date-changes (PORTAL). Idempotent. Never
-- edit after applying.
--
-- Same conventions as the earlier areas (legacy_key, source_sheet,
-- source_row, *_raw next to typed columns, sheet_row).
--
-- portal_access: one row per row of the customer-portal tab. phone and
-- portal_code are what a customer logs in with: never print them in reports
-- or logs.
--
--   account_id_raw  column A. A formula in the sheet for most rows; the
--                   value it shows is kept as text. account_ref is the link
--                   worked out at import (by that id, else by exact account
--                   name when exactly one account has it).
--   monthly_revenue_raw  column P. Never sent to a customer.
--   sheet_row       unique. Settings → Portal saves by it, and new rows go
--                   after the last one.
CREATE TABLE IF NOT EXISTS portal_access (
  id                          BIGSERIAL PRIMARY KEY,
  legacy_key                  TEXT NOT NULL UNIQUE,
  account_id_raw              TEXT NOT NULL DEFAULT '',
  account_name                TEXT NOT NULL DEFAULT '',
  account_ref                 TEXT,
  service_date_raw            TEXT NOT NULL DEFAULT '',
  service_type                TEXT NOT NULL DEFAULT '',
  frequency                   TEXT NOT NULL DEFAULT '',
  cleaning_days               TEXT NOT NULL DEFAULT '',
  address                     TEXT NOT NULL DEFAULT '',
  contact_name                TEXT NOT NULL DEFAULT '',
  phone                       TEXT NOT NULL DEFAULT '',
  email                       TEXT NOT NULL DEFAULT '',
  scope_of_work               TEXT NOT NULL DEFAULT '',
  status                      TEXT NOT NULL DEFAULT '',
  last_visit_date_raw         TEXT NOT NULL DEFAULT '',
  next_scheduled_service      TEXT NOT NULL DEFAULT '',
  last_invoice_date_raw       TEXT NOT NULL DEFAULT '',
  monthly_revenue_raw         TEXT NOT NULL DEFAULT '',
  estimated_monthly_total_raw TEXT NOT NULL DEFAULT '',
  portal_code                 TEXT NOT NULL DEFAULT '',
  portal_access               TEXT NOT NULL DEFAULT '',
  sheet_row                   INTEGER NOT NULL UNIQUE,
  source_sheet                TEXT,
  source_row                  INTEGER,
  imported_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_access_name_idx ON portal_access (lower(btrim(account_name)));
CREATE INDEX IF NOT EXISTS portal_access_code_idx ON portal_access (lower(btrim(portal_code)));

-- portal_requests: what customers send from /portal. One table for the four
-- tabs; `tab` is the sheet tab name the app uses as the kind
-- ("portal-complaints", "portal-service-requests", "portal-date-changes",
-- "portal-billing-requests"; the last has no tab in the sheet).
--
-- The three middle columns mean something different per kind:
--
--   tab                       field_1            field_2             field_3
--   portal-complaints         Issue Type         Description         Date of Incident
--   portal-service-requests   Service Requested  Details             Preferred Date
--   portal-date-changes       Current Date       Requested New Date  Reason
--   portal-billing-requests   Request Type       Details             (unused)
--
--   photos     complaints only: links, comma separated.
--   sheet_row  the row number within its own tab; staff save status and
--              notes by (tab, sheet_row).
CREATE TABLE IF NOT EXISTS portal_requests (
  id                 BIGSERIAL PRIMARY KEY,
  legacy_key         TEXT NOT NULL UNIQUE,
  tab                TEXT NOT NULL,
  account_id_raw     TEXT NOT NULL DEFAULT '',
  account_name       TEXT NOT NULL DEFAULT '',
  account_ref        TEXT,
  submitted_date_raw TEXT NOT NULL DEFAULT '',
  submitted_date     DATE,
  field_1            TEXT NOT NULL DEFAULT '',
  field_2            TEXT NOT NULL DEFAULT '',
  field_3            TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT '',
  staff_notes        TEXT NOT NULL DEFAULT '',
  photos             TEXT NOT NULL DEFAULT '',
  sheet_row          INTEGER NOT NULL,
  source_sheet       TEXT,
  source_row         INTEGER,
  imported_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tab, sheet_row)
);

CREATE INDEX IF NOT EXISTS portal_requests_status_idx ON portal_requests (btrim(status));
