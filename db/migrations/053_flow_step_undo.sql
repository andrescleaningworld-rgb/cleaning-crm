-- 053: the New Account steps can be undone. account_flow_events (migration
-- 046) gets one more action:
--   undo  a step marked done by mistake was taken back (who and when)
-- Schema only: no row is changed. Running it again changes nothing.
--
-- Everything else in this change is in the app (lib/pg/account-flow.ts):
-- steps backed by data (a sub on the account, a start date, the Welcome
-- Packet, the Onboarding Checklist) are marked done when the flow is read,
-- for the accounts already in the flow too.
ALTER TABLE account_flow_events DROP CONSTRAINT IF EXISTS account_flow_events_action_check;
ALTER TABLE account_flow_events ADD CONSTRAINT account_flow_events_action_check
  CHECK (action IN ('start', 'done', 'undo', 'offer', 'yes', 'no', 'back', 'note'));
