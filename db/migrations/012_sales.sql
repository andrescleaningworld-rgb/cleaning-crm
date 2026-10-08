-- Area 10 – Sales: "Sales & Commissions" (MAIN). Idempotent. Never edit
-- after applying.
--
-- Same conventions as the earlier areas (legacy_key, source_sheet,
-- source_row, *_raw next to typed columns, sheet_row).
--
-- Money and percent are kept as the text the sheet shows (the app turns the
-- text into a number itself, and treats anything that is not a plain number
-- as 0), with a typed copy next to it.
--
--   amount_raw             column Q, an older second "amount"; the app
--                          writes the same value as Amount Sold into it.
--   commission_amount_old_raw  column R, a dead duplicate of Commission $.
--                          Never written by the app; kept so nothing is lost.
--   account_ref            the link worked out at import (by Account ID,
--                          else by exact account name).
CREATE TABLE IF NOT EXISTS sales (
  id                         BIGSERIAL PRIMARY KEY,
  legacy_key                 TEXT NOT NULL UNIQUE,
  sale_id                    TEXT NOT NULL DEFAULT '',
  account_id_raw             TEXT NOT NULL DEFAULT '',
  account_name               TEXT NOT NULL DEFAULT '',
  account_ref                TEXT,
  sale_date_raw              TEXT NOT NULL DEFAULT '',
  sale_date                  DATE,
  service_sold               TEXT NOT NULL DEFAULT '',
  work_order_estimate_number TEXT NOT NULL DEFAULT '',
  sold_by                    TEXT NOT NULL DEFAULT '',
  amount_sold_raw            TEXT NOT NULL DEFAULT '',
  amount_sold                NUMERIC,
  commission_percent_raw     TEXT NOT NULL DEFAULT '',
  commission_percent         NUMERIC,
  commission_amount_raw      TEXT NOT NULL DEFAULT '',
  commission_amount          NUMERIC,
  status                     TEXT NOT NULL DEFAULT '',
  notes                      TEXT NOT NULL DEFAULT '',
  created_at_raw             TEXT NOT NULL DEFAULT '',
  sale_created_at            TIMESTAMPTZ,
  updated_at_raw             TEXT NOT NULL DEFAULT '',
  sale_updated_at            TIMESTAMPTZ,
  service_type               TEXT NOT NULL DEFAULT '',
  manager                    TEXT NOT NULL DEFAULT '',
  amount_raw                 TEXT NOT NULL DEFAULT '',
  commission_amount_old_raw  TEXT NOT NULL DEFAULT '',
  recurring_start_date_raw   TEXT NOT NULL DEFAULT '',
  recurring_start_date       DATE,
  recurring_end_date_raw     TEXT NOT NULL DEFAULT '',
  recurring_end_date         DATE,
  sheet_row                  INTEGER NOT NULL UNIQUE,
  source_sheet               TEXT,
  source_row                 INTEGER,
  imported_at                TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_sale_id_idx ON sales (sale_id);
CREATE INDEX IF NOT EXISTS sales_date_idx ON sales (sale_date);
