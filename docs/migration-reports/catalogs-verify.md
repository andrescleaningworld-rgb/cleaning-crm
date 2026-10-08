# catalogs – verify

Run 2026-10-07 by `scripts/migrate/verify-catalogs.mjs`. Sheets (read-only) compared with the Neon dev branch. Counts only, no cell values.

**Result: all tables match.** Open questions in `migration_issues`: 0.

| Table | From | Sheet rows | Skipped by rule | Postgres rows | Missing | Extra | Field mismatches | Created in Postgres | OK |
|---|---|---|---|---|---|---|---|---|---|
| changelog_entries | PORTAL/ChangeLog | 3 | 0 | 3 | 0 | 0 | 0 | 0 | ✓ |
| geocode_cache | MAIN/GeocodeCache | 0 | 0 | 0 | 0 | 0 | 0 | 0 | ✓ |
| extra_services | PORTAL/ExtraServices | 4 | 0 | 4 | 0 | 0 | 0 | 0 | ✓ |
| documents | MAIN/Documents | 5 | 0 | 5 | 0 | 0 | 0 | 0 | ✓ |
| document_sends | MAIN/DocumentSends | 7 | 0 | 7 | 0 | 0 | 0 | 0 | ✓ |

"Skipped by rule" = rows the app itself ignores today (no ID, or a geocode row without coordinates).

## Per table

### changelog_entries

3 rows checked field by field (3 columns each): all equal.

entry_date: 2026-09-14 to 2026-09-14; 0 rows where the text is not a date.

### geocode_cache

0 rows checked field by field (3 columns each): all equal.

geocoded_at: – to –; 0 rows where the text is not a date.

### extra_services

4 rows checked field by field (5 columns each): all equal.

Counts by active: true 4.

### documents

5 rows checked field by field (7 columns each): all equal.

Counts by category: Contract 1, Handbook 3, Other 1.

uploaded_at: 2026-08-18 to 2026-08-18; 0 rows where the text is not a date.

Sum of file_size: sheets 160906 / postgres 160906 ✓

### document_sends

7 rows checked field by field (7 columns each): all equal.

sent_at: 2026-08-18 to 2026-08-19; 0 rows where the text is not a date.
