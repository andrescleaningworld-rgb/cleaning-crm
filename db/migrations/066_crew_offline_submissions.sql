-- 066: Crew Link checklists sent later, with no signal (route screen).
-- Finish saves the checklist on the phone with its own id (made on the
-- phone) and the moment Finish was tapped; the phone sends it when it has
-- signal again, and tries again until the server answers.
--
--   client_id    the phone-made id. A checklist that arrives twice (the
--                answer was lost on a weak signal) is kept once: the second
--                one only gets "already here". Old rows have none.
--   received_at  when it reached the server. submitted_at stays "when the
--                crew tapped Finish" (the phone's time, when believable).
--                Old rows stay empty (for them it was the same moment).
--
-- Two columns and one index. No row is changed. Running it again changes
-- nothing. Take a Neon backup branch first.
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS client_id TEXT;
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ;
ALTER TABLE checklist_submissions ALTER COLUMN received_at SET DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS checklist_submissions_client_id_key ON checklist_submissions (client_id) WHERE client_id IS NOT NULL;
