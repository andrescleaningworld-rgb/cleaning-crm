-- 086: a visit keeps the sub the account had on the visit date, and who did
-- the visit by Staff ID (Visits page: Subcontractor and Completed By).
--
-- Before this, visits had no sub at all: the old Visits tab had no column for
-- it, the move to Postgres kept it that way, and the form's sub was dropped
-- on save. So the Visits Subcontractor column said "None" on every visit.
--
-- visits.sub_id                 the sub (subcontractors.id) the account had
--                               on the visit date. Saved with every new visit
--                               from now on (lib/pg/visits.ts addVisit); it
--                               does not follow later sub changes.
-- visits.sub_source             where sub_id came from: 'saved' (a visit made
--                               after this), 'schedule' (the backfill found a
--                               sub schedule covering the visit date),
--                               'current' (the backfill used the account's
--                               sub now, see below). '' = no sub.
-- visits.completed_by_staff_id  the Staff row of who did the visit, so
--                               "Andrés" and "Andres" are one person.
--
-- Backfill (only visits with no sub yet, linked to an account):
--   1. A sub schedule of that account covering the visit date
--      (effective_start <= date <= effective_end, no end = still going;
--      a schedule with no end only counts while it is Active).
--   2. Else the account's sub now, but only for visits on or after the
--      account's last accepted sub transfer; with no transfer on record,
--      only visits in the last 90 days. Older visits stay with no sub ("None").
-- Completed By: matched to Staff by name, ignoring case, spaces and accents
-- (á é í ó ú ñ ü), only when exactly one staff member has that name. The
-- text is set to that staff member's name. "Drew/Greg" and unknown names are
-- left as they are.
--
-- The app works before this runs (no sub, names as typed). Safe to run twice.
-- Take a Neon backup branch first. Preview the counts with the read-only
-- checks (visit-sub-backfill-check.sql) before running.

ALTER TABLE visits ADD COLUMN IF NOT EXISTS sub_id TEXT REFERENCES subcontractors (id) ON DELETE SET NULL;
ALTER TABLE visits ADD COLUMN IF NOT EXISTS sub_source TEXT NOT NULL DEFAULT '';
ALTER TABLE visits ADD COLUMN IF NOT EXISTS completed_by_staff_id TEXT REFERENCES staff (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS visits_sub_idx ON visits (sub_id);
CREATE INDEX IF NOT EXISTS visits_completed_by_staff_idx ON visits (completed_by_staff_id);

-- 1. From the sub schedules.
UPDATE visits v
SET sub_id = pick.sub_id, sub_source = 'schedule'
FROM (
  SELECT DISTINCT ON (v2.id) v2.id, ss.subcontractor_id AS sub_id
  FROM visits v2
  JOIN sub_schedules ss ON ss.account_ref = v2.account_ref
  JOIN subcontractors s ON s.id = ss.subcontractor_id
  WHERE v2.sub_id IS NULL AND v2.account_ref IS NOT NULL AND v2.visit_date IS NOT NULL
    AND ss.effective_start IS NOT NULL AND ss.effective_start <= v2.visit_date
    AND (ss.effective_end >= v2.visit_date OR (ss.effective_end IS NULL AND lower(btrim(ss.status)) = 'active'))
  ORDER BY v2.id, ss.effective_start DESC, ss.id DESC
) pick
WHERE v.id = pick.id AND v.sub_id IS NULL;

-- 2. From the account's sub now, after its last sub change (or the last 90 days).
WITH last_change AS (
  SELECT a.id AS account_id, max(
    CASE
      WHEN btrim(t.accepted_at_raw) ~ '^\d{4}-\d{2}-\d{2}' THEN substring(btrim(t.accepted_at_raw) FROM 1 FOR 10)::date
      WHEN btrim(t.accepted_at_raw) ~ '^\d{1,2}/\d{1,2}/\d{4}' THEN to_date(substring(btrim(t.accepted_at_raw) FROM '^\d{1,2}/\d{1,2}/\d{4}'), 'MM/DD/YYYY')
    END
  ) AS changed_on
  FROM sub_transfer_proposals t
  JOIN accounts a ON a.pk = t.account_pk
  WHERE lower(btrim(t.status)) = 'accepted' AND a.id IS NOT NULL
  GROUP BY a.id
)
UPDATE visits v
SET sub_id = a.subcontractor_id, sub_source = 'current'
FROM accounts a
LEFT JOIN last_change lc ON lc.account_id = a.id
WHERE v.account_ref = a.id AND v.sub_id IS NULL AND v.visit_date IS NOT NULL
  AND a.subcontractor_id IS NOT NULL
  AND v.visit_date >= COALESCE(lc.changed_on, (now() AT TIME ZONE 'America/New_York')::date - 90);

-- 3. Completed By -> Staff, by name (one match only).
WITH staff_keys AS (
  SELECT lower(translate(btrim(name), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')) AS name_key, min(id) AS id, min(btrim(name)) AS name
  FROM staff
  WHERE btrim(name) <> ''
  GROUP BY 1
  HAVING count(*) = 1
)
UPDATE visits v
SET completed_by_staff_id = k.id, completed_by = k.name
FROM staff_keys k
WHERE v.completed_by_staff_id IS NULL AND btrim(v.completed_by) <> ''
  AND lower(translate(btrim(v.completed_by), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')) = k.name_key;
