-- 049: Frequency from free text to the short list (lib/frequency.ts).
-- Each old spelling below means exactly one list item ("1x Wk" -> "1x per
-- week", "EOW" -> "Every other week"). Anything else (extra words, ranges,
-- several services) is left as it is and shows as Other with its text.
-- The value is held twice, like every account field: the frequency column
-- and position 4 of the `unformatted` row (what the account lists read).
-- Both are set. Matched on the exact old text, so running it again changes
-- nothing.
--
-- Data only, no schema change. 45 spellings, 196 accounts.
WITH map(old_value, new_value) AS (VALUES
  ('1x per Week', '1x per week'),
  ('1x Week', '1x per week'),
  ('1x week', '1x per week'),
  ('E/O week', 'Every other week'),
  ('2x Week', '2x per week'),
  ('2x week', '2x per week'),
  ('EOW', 'Every other week'),
  ('5x week', '5x per week'),
  ('2x per Week', '2x per week'),
  ('1x Month', '1x per month'),
  ('2x Month', '2x per month'),
  ('1x Per Week', '1x per week'),
  ('5x Week', '5x per week'),
  ('5x per Week', '5x per week'),
  ('5x Per Week', '5x per week'),
  ('3x week', '3x per week'),
  ('1x Wk', '1x per week'),
  ('7x a week', '7x per week'),
  ('2x per Month', '2x per month'),
  ('1x per Month', '1x per month'),
  ('1x wk', '1x per week'),
  ('1x EOW', 'Every other week'),
  ('2x Per Week', '2x per week'),
  ('3x Week', '3x per week'),
  ('5X per week', '5x per week'),
  ('5x wk', '5x per week'),
  ('6x per Week', '6x per week'),
  ('7x per Week', '7x per week'),
  ('2 x Week', '2x per week'),
  ('1xweek', '1x per week'),
  ('3x Wk', '3x per week'),
  ('3x per Week', '3x per week'),
  ('4x per Week', '4x per week'),
  ('5 Days per week', '5x per week'),
  ('Every Other Week', 'Every other week'),
  ('6x Week', '6x per week'),
  ('6x week', '6x per week'),
  ('1x Per week', '1x per week'),
  ('1x Per Month', '1x per month'),
  ('7x week', '7x per week'),
  ('7x wk', '7x per week'),
  ('E/O Week', 'Every other week'),
  ('E/o week', 'Every other week'),
  ('2x Wk', '2x per week'),
  ('2x month', '2x per month')
)
UPDATE accounts a
SET frequency = map.new_value,
    unformatted = CASE
      WHEN jsonb_typeof(a.unformatted) = 'array' AND a.unformatted ->> 4 = map.old_value
        THEN jsonb_set(a.unformatted, '{4}', to_jsonb(map.new_value))
      ELSE a.unformatted
    END
FROM map
WHERE a.frequency = map.old_value;
