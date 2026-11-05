-- 071: Sub score: "Exclude from sub score", and a marker for the new size rule.
--
--   subcontractors.exclude_from_score   Yes/no on a sub record (default no).
--                                       On = no score ("Not scored"), no ⚠ on
--                                       Accounts center, no score emails.
--                                       Turned on here for the in-house
--                                       "Cleaning World" records (SUB-006,
--                                       SUB-007, SUB-008) and the placeholder
--                                       "Pending ask Patricia" (SUB-028).
--
--   sub_score_alert_state.formula_version
--                                       Which score rules the alert check last
--                                       ran with. 1 = the old size rule. The
--                                       app's rules are now 2 (workload points:
--                                       30 ÷ (active accounts + monthly sub pay
--                                       ÷ 500), kept between 0.4 and 2.0). The
--                                       first check under new rules opens
--                                       alerts for the office but emails no
--                                       sub, then moves this to 2.
--
-- Nothing else changes. Running it again only switches those four subs back
-- to excluded if someone turned them off by hand.
ALTER TABLE subcontractors ADD COLUMN IF NOT EXISTS exclude_from_score BOOLEAN NOT NULL DEFAULT false;

UPDATE subcontractors SET exclude_from_score = true
WHERE id IN ('SUB-006', 'SUB-007', 'SUB-008', 'SUB-028')
  AND (lower(btrim(company_name)) = 'cleaning world' OR lower(btrim(company_name)) = 'pending ask patricia')
  AND NOT exclude_from_score;

ALTER TABLE sub_score_alert_state ADD COLUMN IF NOT EXISTS formula_version INTEGER NOT NULL DEFAULT 1;
