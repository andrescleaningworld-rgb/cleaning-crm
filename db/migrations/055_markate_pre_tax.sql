-- 055: Markate amounts before tax. The CRM never uses an amount with tax in
-- it (sub pay is worked out from the gross before tax). Until now the import
-- saved the estimate's total WITH tax (EST-050378 showed $1,386.13).
--
-- This fixes the estimates already brought in, from the Markate data saved
-- with each one (raw), with the same sums as lib/markate.ts (estimateTotal,
-- linePreTax):
--   a line item's tax (tax_amount) is inside its total unless the total is
--   clearly qty x price - discount; when in doubt the tax is taken out.
--   total            Markate's subtotal; when that is the line totals added
--                    up, less the tax inside them. No subtotal: the line
--                    items before tax added up. Neither: left as it is.
--   recurring_total  less the tax inside the recurring line items.
-- Then the paper on the Pin Board shows the new amount.
--
-- A row done is marked raw.cwPreTax = true (new imports are saved with it),
-- so running this again changes nothing.

CREATE OR REPLACE FUNCTION pg_temp.cw_money(value TEXT) RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN regexp_replace(COALESCE(value, ''), '[^0-9.-]', '', 'g') ~ '^-?[0-9]*\.?[0-9]+$'
              THEN regexp_replace(value, '[^0-9.-]', '', 'g')::numeric ELSE 0 END
$$;

WITH lines AS (
  SELECT e.id,
         pg_temp.cw_money(l.value->>'total') AS total,
         pg_temp.cw_money(l.value->>'tax_amount') AS tax,
         pg_temp.cw_money(l.value->>'qty') * pg_temp.cw_money(l.value->>'price') - pg_temp.cw_money(l.value->>'discount_amount') AS before_tax,
         (EXISTS (SELECT 1 FROM markate_recurring_items r
                  WHERE btrim(COALESCE(l.value->>'name', '')) <> ''
                    AND lower(regexp_replace(btrim(r.name), '\s+', ' ', 'g')) = lower(regexp_replace(btrim(l.value->>'name'), '\s+', ' ', 'g')))
          OR COALESCE(l.value->>'description', '') ~* 'per\s+month') AS recurring
  FROM markate_estimates e
  CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(e.raw->'items') = 'array' THEN e.raw->'items' ELSE '[]'::jsonb END) l
  WHERE NOT (e.raw ? 'cwPreTax')
),
taxed AS (
  SELECT id, total, recurring,
         CASE WHEN tax <= 0 THEN 0
              WHEN abs(total - (before_tax + tax)) < 0.015 THEN tax
              WHEN abs(total - before_tax) < 0.015 THEN 0
              ELSE tax END AS tax_in
  FROM lines
),
sums AS (
  SELECT id,
         sum(total) AS lines_total,
         sum(tax_in) AS tax_in,
         sum(total - tax_in) AS lines_pre_tax,
         sum(CASE WHEN recurring THEN tax_in ELSE 0 END) AS recurring_tax_in
  FROM taxed GROUP BY id
),
fixed AS (
  SELECT e.id,
         CASE WHEN btrim(COALESCE(e.raw->>'subtotal', '')) <> ''
                THEN pg_temp.cw_money(e.raw->>'subtotal')
                     - CASE WHEN s.id IS NOT NULL AND abs(pg_temp.cw_money(e.raw->>'subtotal') - s.lines_total) < 0.015 THEN s.tax_in ELSE 0 END
              WHEN s.id IS NOT NULL THEN s.lines_pre_tax
              ELSE e.total END AS total,
         CASE WHEN e.recurring_total > 0 THEN e.recurring_total - COALESCE(s.recurring_tax_in, 0) ELSE e.recurring_total END AS recurring_total
  FROM markate_estimates e
  LEFT JOIN sums s ON s.id = e.id
  WHERE NOT (e.raw ? 'cwPreTax')
)
UPDATE markate_estimates e
SET total = round(f.total, 2),
    recurring_total = round(f.recurring_total, 2),
    raw = e.raw || '{"cwPreTax": true}'::jsonb
FROM fixed f
WHERE f.id = e.id;

UPDATE handoff_items h
SET data = jsonb_set(h.data, '{notes}', to_jsonb('$' || to_char(e.total, 'FM999,999,990.00') || ' · ' || e.matched_item))
FROM markate_estimates e
WHERE h.kind = 'note' AND h.item_id = 'markate-' || e.id::text AND e.matched_item <> '';
