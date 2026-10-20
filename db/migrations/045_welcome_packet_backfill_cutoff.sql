-- 045: limits 043 to accounts created before October 19, 2026 (New York
-- time). 043 ticked "Welcome packet sent to customer" on every account whose
-- other section 6 items were done; an account created from October 19 on must
-- be marked sent only when a packet really goes out. So for those accounts the
-- tick 043 added (recognised by its note) is taken off again, which leaves the
-- item exactly as it was before 043. A tick from a real send has a different
-- note and is never touched.
--
-- Data only, no schema change. Running it again changes nothing.
WITH targets AS (
  SELECT c.account_id, c.items - 'contact.welcomePacketSent' AS new_items
  FROM onboarding_checklists c
  JOIN accounts a ON a.id = c.account_id
  WHERE a.created_at >= TIMESTAMPTZ '2026-10-19 00:00:00 America/New_York'
    AND (c.items -> 'contact.welcomePacketSent' ->> 'note') = 'Marked done automatically - existing account'
)
UPDATE onboarding_checklists AS c
SET items = t.new_items,
    items_raw = t.new_items::text,
    updated_at = now()
FROM targets AS t
WHERE c.account_id = t.account_id;
