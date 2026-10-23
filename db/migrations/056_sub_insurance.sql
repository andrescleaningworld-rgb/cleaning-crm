-- 056: Sub insurance (COI) tracker, and the switches/settings table the new
-- reminder features share. lib/pg/sub-insurance.ts and lib/pg/feature-settings.ts
-- read and write these tables.
--
-- feature_settings     one row per setting (key), its value as JSON. Used by
--                      Settings -> Reminders & check-ins: the sub portal
--                      insurance switch, the "At risk" thresholds, the
--                      customer check-in switch. A missing row = the default.
-- sub_coi_documents    every COI file for a sub (a PDF or a photo, stored in
--                      Vercel Blob). status:
--                        'pending'   a sub sent it from the portal; the office
--                                    has not checked it yet. It does not count.
--                        'approved'  the one that counts. Approving it sets the
--                                    sub's insurance expiration date.
--                        'rejected'  the office said no (reject_reason is shown
--                                    to the sub).
--                        'replaced'  an older approved one.
--                      An office upload is approved at once.
-- sub_coi_alerts       the reminders already done, so each goes out once:
--                      'soon' (30 days before) and 'expired', per sub and
--                      expiration date.
--
-- Running it again changes nothing.

CREATE TABLE IF NOT EXISTS feature_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by  TEXT NOT NULL DEFAULT '',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sub_coi_documents (
  id             BIGSERIAL PRIMARY KEY,
  sub_id         TEXT NOT NULL REFERENCES subcontractors (id) ON DELETE CASCADE,
  file_url       TEXT NOT NULL,
  file_name      TEXT NOT NULL DEFAULT '',
  content_type   TEXT NOT NULL DEFAULT '',
  expires_on     DATE NOT NULL,
  source         TEXT NOT NULL DEFAULT 'office' CHECK (source IN ('office', 'sub')),
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'replaced')),
  uploaded_by    TEXT NOT NULL DEFAULT '',
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_by    TEXT NOT NULL DEFAULT '',
  reviewed_at    TIMESTAMPTZ,
  reject_reason  TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS sub_coi_documents_sub_idx ON sub_coi_documents (sub_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS sub_coi_documents_pending_idx ON sub_coi_documents (uploaded_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS sub_coi_alerts (
  sub_id      TEXT NOT NULL REFERENCES subcontractors (id) ON DELETE CASCADE,
  expires_on  DATE NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('soon', 'expired')),
  done_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (sub_id, expires_on, kind)
);
