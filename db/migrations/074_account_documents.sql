-- 074: Documents on every account page (lib/pg/account-documents.ts).
--
--   account_documents   One row per file an account has: uploaded by staff
--                       (scope of work, cleaning routine, floor plan,
--                       contract, ...), or filed by the app itself: the
--                       accepted estimate of a new account (account_flows) or
--                       of a Price & frequency change (account_price_changes),
--                       and each Welcome Packet sent. One place for all of an
--                       account's files.
--                       share_with_sub on = the account's sub sees it in their
--                       portal and on Crew Link (view / download only).
--                       Customers never see these.
--                       source_key: set on the rows the app files itself, so
--                       each is filed once ("flow:<account>", "price-change:<id>").
--
-- The accepted estimates already saved are filed here once. Safe to run twice.

CREATE TABLE IF NOT EXISTS account_documents (
  id             BIGSERIAL PRIMARY KEY,
  account_id     TEXT NOT NULL,
  account_name   TEXT NOT NULL DEFAULT '',
  name           TEXT NOT NULL,
  doc_type       TEXT NOT NULL DEFAULT 'Other',
  note           TEXT NOT NULL DEFAULT '',
  file_url       TEXT NOT NULL,
  file_name      TEXT NOT NULL DEFAULT '',
  file_size      BIGINT NOT NULL DEFAULT 0,
  content_type   TEXT NOT NULL DEFAULT '',
  share_with_sub BOOLEAN NOT NULL DEFAULT false,
  source_key     TEXT UNIQUE,
  uploaded_by    TEXT NOT NULL DEFAULT '',
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS account_documents_account_idx ON account_documents (account_id, uploaded_at DESC);

DO $$
BEGIN
  IF to_regclass('public.account_flows') IS NOT NULL THEN
    INSERT INTO account_documents (account_id, account_name, name, doc_type, file_url, file_name, source_key, uploaded_by, uploaded_at)
    SELECT f.account_id, f.account_name, COALESCE(NULLIF(btrim(f.estimate_name), ''), 'Accepted estimate'), 'Accepted estimate',
      f.estimate_url, btrim(f.estimate_name), 'flow:' || f.account_id, f.created_by, f.created_at
    FROM account_flows f WHERE btrim(f.estimate_url) <> ''
    ON CONFLICT (source_key) DO NOTHING;
  END IF;
  IF to_regclass('public.account_price_changes') IS NOT NULL THEN
    INSERT INTO account_documents (account_id, account_name, name, doc_type, note, file_url, file_name, source_key, uploaded_by, uploaded_at)
    SELECT c.account_id, c.account_name, COALESCE(NULLIF(btrim(c.estimate_name), ''), 'Accepted estimate'), 'Accepted estimate',
      'Price & frequency change, effective ' || c.effective_date::text, c.estimate_url, btrim(c.estimate_name), 'price-change:' || c.id, c.created_by, c.created_at
    FROM account_price_changes c WHERE btrim(c.estimate_url) <> ''
    ON CONFLICT (source_key) DO NOTHING;
  END IF;
END
$$;
