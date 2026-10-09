-- Extra Jobs: one-time work a customer asks for on top of the regular
-- cleaning. Postgres only. Nothing here is imported from or written to
-- Google Sheets or Apps Script.
--
-- The flow: a manager sets the job up (that also creates a one-time Sale,
-- 10% commission) -> the office is told by email and sees it under "Set up"
-- -> the manager marks it Done with at least one after photo -> the office
-- is told again and sees it under "Ready to invoice". Invoicing happens in
-- the office, outside the app.
--
-- "Extra jobs not in the app don't get paid": the "Extra jobs to pay" report
-- is built from the Done rows of this table and nothing else.

-- extra_jobs: one row per job.
--   job_number      the number printed on the work order: EJ-1001, EJ-1002 ...
--   source          how the request came in. 'portal' is for the day the
--                   customer portal can ask for one; portal_request_id then
--                   says which request it was
--   customer_price  what the customer pays. Never printed on the sub copy
--   sub_pay         what the sub is paid for this job
--   status          'setup' -> 'done' (ready to invoice)
--   sale_id         the Sale created with it (sales.sale_id)
--   *_emailed_at    when the office was told; NULL = that email did not go out
CREATE TABLE IF NOT EXISTS extra_jobs (
  id                 BIGSERIAL PRIMARY KEY,
  job_number         TEXT NOT NULL UNIQUE,
  account_id         TEXT NOT NULL DEFAULT '',
  account_name       TEXT NOT NULL DEFAULT '',
  source             TEXT NOT NULL DEFAULT 'call' CHECK (source IN ('call', 'text', 'email', 'portal')),
  portal_request_id  TEXT NOT NULL DEFAULT '',
  description        TEXT NOT NULL DEFAULT '',
  job_date           DATE NOT NULL,
  customer_price     NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (customer_price >= 0),
  sub_id             TEXT NOT NULL DEFAULT '',
  sub_name           TEXT NOT NULL DEFAULT '',
  sub_pay            NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (sub_pay >= 0),
  sold_by            TEXT NOT NULL DEFAULT '',
  manager            TEXT NOT NULL DEFAULT '',
  status             TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'done')),
  sale_id            TEXT NOT NULL DEFAULT '',
  created_by         TEXT NOT NULL DEFAULT '',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  setup_emailed_at   TIMESTAMPTZ,
  done_by            TEXT NOT NULL DEFAULT '',
  done_at            TIMESTAMPTZ,
  done_note          TEXT NOT NULL DEFAULT '',
  done_emailed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS extra_jobs_status_idx ON extra_jobs (status, job_date);
CREATE INDEX IF NOT EXISTS extra_jobs_account_idx ON extra_jobs (account_id);
CREATE INDEX IF NOT EXISTS extra_jobs_sub_idx ON extra_jobs (sub_id, job_date) WHERE status = 'done';

-- The job number comes from its own counter, so two jobs saved at the same
-- moment can never get the same number.
CREATE SEQUENCE IF NOT EXISTS extra_job_number_seq START 1001;

-- extra_job_photos: the after photos added when a job is marked Done. The
-- file is in Blob storage (extra-jobs/); this row says which job it is for.
CREATE TABLE IF NOT EXISTS extra_job_photos (
  id          BIGSERIAL PRIMARY KEY,
  job_id      BIGINT NOT NULL REFERENCES extra_jobs (id) ON DELETE CASCADE,
  moment      TEXT NOT NULL DEFAULT 'after' CHECK (moment IN ('before', 'after')),
  url         TEXT NOT NULL,
  file_name   TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT NOT NULL DEFAULT '',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extra_job_photos_job_idx ON extra_job_photos (job_id, uploaded_at);
