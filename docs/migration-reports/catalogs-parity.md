# Parity – catalogs

Each read function run with `DATA_SOURCE_CATALOGS=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**11 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| getRecentChangelogEntries(3) | identical | 3 rows |
| getRecentChangelogEntries(50) | identical | 3 rows |
| fetchExtraServices | identical | 4 rows |
| getExtraServiceById(first) | identical | 1 value |
| getExtraServiceById(missing) | identical | 1 value |
| fetchDocuments | identical | 5 rows |
| getDocumentById(first) | identical | 1 value |
| getDocumentById(missing) | identical | 1 value |
| fetchDocumentSends() | identical | 7 rows |
| fetchDocumentSends(first document) | identical | 2 rows |
| getGeocodeCacheEntry(missing) | identical | 1 value |
