# Parity – subs

Each read function run with `DATA_SOURCE_SUBS=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**4 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| getAllSubcontractorsRaw | identical | 39 rows |
| getAllSubcontractorsRaw ids in order | identical | 39 rows |
| getSubcontractorActivityLog | identical | 385 rows |
| Apps Script getSubcontractors list (profile fields, without phone) | identical | 39 rows |
