-- 091: an "At risk" flag that stays on after 2 check-ins in a row that were
-- not Great (lib/pg/checkin-follow-up.ts). The other at-risk reasons are worked
-- out fresh each time; this one is saved, and only a person clears it.
--
-- checkin_risk_reason      the reason while the flag is on ('' = off)
-- checkin_risk_at          when it went on
-- checkin_risk_cleared_at  when a person last cleared it: answers from before
--                          then no longer count
--
-- Running it again changes nothing. Before it runs, check-ins work as usual and
-- this flag simply does not go on.

ALTER TABLE account_risk_flags ADD COLUMN IF NOT EXISTS checkin_risk_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE account_risk_flags ADD COLUMN IF NOT EXISTS checkin_risk_at TIMESTAMPTZ;
ALTER TABLE account_risk_flags ADD COLUMN IF NOT EXISTS checkin_risk_cleared_at TIMESTAMPTZ;
