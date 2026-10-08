# Parity – visits

Each read function run with `DATA_SOURCE_VISITS=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**19 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| getManagerVisitById(sample 1) | identical | 1 value |
| getManagerVisitById(sample 2) | identical | 1 value |
| getManagerVisitById(sample 3) | identical | 1 value |
| getManagerVisitById(sample 4) | identical | 1 value |
| getManagerVisitById(sample 5) | identical | 1 value |
| getManagerVisitById(sample 6) | identical | 1 value |
| getManagerVisitById(sample 7) | identical | 1 value |
| getManagerVisitById(sample 8) | identical | 1 value |
| getManagerVisitById(missing) | identical | 1 value |
| getManagerVisitById(blank) | identical | 1 value |
| fetchVisitEditLog(visit 1 with edits) | identical | 2 rows |
| fetchVisitEditLog(visit 2 with edits) | identical | 1 rows |
| fetchVisitEditLog(visit 3 with edits) | identical | 1 rows |
| fetchVisitEditLog(visit 4 with edits) | identical | 1 rows |
| fetchVisitEditLog(visit 5 with edits) | identical | 1 rows |
| fetchVisitEditLog(visit without edits) | identical | 0 rows |
| getVisitsByAccountName(an account name) | identical | 0 rows |
| getVisitsByAccountName(a column-B value) | identical | 1 rows |
| getVisitsByAccountName(nobody) | identical | 0 rows |
