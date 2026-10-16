-- 043: the Onboarding Checklist gained "Welcome packet sent to customer"
-- (contact.welcomePacketSent, section 6). An account whose section 6 was
-- already complete would now have one open item there, and the New accounts
-- board (lib/pg/handoffs.ts syncAccountStep) would move it back to step 6 the
-- next time anyone ticks its checklist. So every account whose three earlier
-- section 6 items are all ticked gets the new item ticked too, with a note
-- saying it was done here.
--
-- Data only, no schema change. Running it again changes nothing (an already
-- ticked item is skipped). The app keeps items and items_raw the same, so
-- both are written.
WITH targets AS (
  SELECT account_id,
         jsonb_set(
           items,
           '{contact.welcomePacketSent}',
           jsonb_build_object(
             'checked', true,
             'note', 'Marked done automatically - existing account',
             'completedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
             'fieldOverwriteNote', NULL
           ),
           true
         ) AS new_items
  FROM onboarding_checklists
  WHERE (items -> 'contact.primaryContactConfirmed' ->> 'checked') = 'true'
    AND (items -> 'contact.portalAccessSetup' ->> 'checked') = 'true'
    AND (items -> 'contact.billingConfirmed' ->> 'checked') = 'true'
    AND COALESCE(items -> 'contact.welcomePacketSent' ->> 'checked', 'false') <> 'true'
)
UPDATE onboarding_checklists AS c
SET items = t.new_items,
    items_raw = t.new_items::text,
    updated_at = now()
FROM targets AS t
WHERE c.account_id = t.account_id;
