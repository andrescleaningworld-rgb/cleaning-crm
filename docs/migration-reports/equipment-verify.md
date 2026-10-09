# equipment – verify

Run 2026-10-08 by `scripts/migrate/verify-equipment.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 0.

| Table | From | Sheet rows | Skipped by rule | Duplicate keys | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|---|
| equipment_categories | MAIN/EquipmentCategories | 2 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | ✓ |
| equipment | MAIN/Equipment | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | ✓ |
| equipment_checkouts | MAIN/EquipmentCheckouts | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | ✓ |
| equipment_repairs | MAIN/EquipmentRepairs | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |
| equipment_parts | MAIN/EquipmentParts | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today. "Duplicate keys" = later rows with a key already seen; the first row is kept.

## Per table

### equipment_categories

2 rows checked field by field (4 columns each): all equal.

Counts by active: true 2.

### equipment

1 rows checked field by field (16 columns each): all equal.

Counts by status_raw: Available 1.

item_created_at: 2026-08-19 to 2026-08-19; 0 rows where the text is not a date.

### equipment_checkouts

1 rows checked field by field (17 columns each): all equal.

Counts by holder_type: InsideStaff 1.

checked_out_at: 2026-09-24 to 2026-09-24; 0 rows where the text is not a date.

### equipment_repairs

0 rows checked field by field (9 columns each): all equal.

Counts by status_raw: none.

started_at: – to –; 0 rows where the text is not a date.

### equipment_parts

0 rows checked field by field (7 columns each): all equal.
