-- 047: one spelling for Active. 106 accounts say "ACTIVE" (from the old
-- sheet) and 213 say "Active"; they already mean the same (status_key
-- 'active'), only the text differs. The status is held twice, like every
-- account field: the status column, and position 16 of the `unformatted`
-- row (what the account lists read). Both become "Active".
--
-- Data only, no schema change. Nothing else is renamed: the other statuses
-- (Inactive, Other *) are set by hand on their account pages. Running it
-- again changes nothing.
UPDATE accounts
SET status = 'Active',
    unformatted = CASE
      WHEN jsonb_typeof(unformatted) = 'array' AND btrim(unformatted ->> 16) = 'ACTIVE'
        THEN jsonb_set(unformatted, '{16}', '"Active"'::jsonb)
      ELSE unformatted
    END
WHERE btrim(status) = 'ACTIVE';
