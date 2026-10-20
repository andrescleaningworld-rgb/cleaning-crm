-- 050: the account's cleaning time. Either a time window ("18:00-21:00",
-- the crew comes any time from 6 pm to 9 pm) or an exact appointment
-- ("19:00", the crew comes at 7 pm). lib/cleaningTime.ts reads and writes
-- it. '' = not set. Not a sheet column, so it is not part of `unformatted`.
-- The New Account offer's start time is filled in from it.
--
-- Schema only, no data change. Running it again changes nothing.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cleaning_time TEXT NOT NULL DEFAULT '';
