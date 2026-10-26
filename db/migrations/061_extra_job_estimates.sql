-- 061: Extra Jobs, the approved estimate. Postgres only.
--
-- extra_jobs.estimate_number   the estimate's number when it came from
--                              Markate (free text, may be empty). Office
--                              only: the job page, the office copy of the
--                              work order and the office emails. Never on the
--                              sub copy. The existing wo_number (023) is now
--                              shown as "Customer WO #".
--
-- extra_job_estimates          the approved estimate file(s): a PDF, or a
--                              photo of a signed one; more than one for
--                              revisions. The file is in Blob storage under
--                              extra-jobs/<job number>/estimates/, like the
--                              after photos. Its own table, not
--                              extra_job_photos: the Photos page copies every
--                              extra_job_photos row, and an estimate carries
--                              our prices. Never on the sub copy or in the
--                              sub portal.
--
-- Schema only, no data change. Running it again changes nothing.
ALTER TABLE extra_jobs ADD COLUMN IF NOT EXISTS estimate_number TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS extra_job_estimates (
  id           BIGSERIAL PRIMARY KEY,
  job_id       BIGINT NOT NULL REFERENCES extra_jobs (id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  file_name    TEXT NOT NULL DEFAULT '',
  content_type TEXT NOT NULL DEFAULT '',
  uploaded_by  TEXT NOT NULL DEFAULT '',
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS extra_job_estimates_job_idx ON extra_job_estimates (job_id, uploaded_at);
