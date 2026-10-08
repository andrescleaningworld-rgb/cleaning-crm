# Parity – scheduling

Each read function run with `DATA_SOURCE_SCHEDULING=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**7 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| fetchSubSchedules | identical | 298 rows |
| fetchScheduleExceptions | identical | 0 rows |
| getAllSubcontractorVisits | identical | 1 rows |
| getSubcontractorVisits(first sub) | identical | 1 rows |
| getSubcontractorVisits(first sub, its account, other letter case) | identical | 1 rows |
| getSubcontractorVisits(first sub, other account) | identical | 0 rows |
| getSubcontractorVisits(nobody) | identical | 0 rows |
