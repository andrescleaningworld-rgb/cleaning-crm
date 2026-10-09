# Parity – accounts

Each read function run with `DATA_SOURCE_ACCOUNTS=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**11 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| fetchAllMainAccounts (customer-safe shape) | identical | 398 rows |
| getMainAccountById(every 10th) | identical | 40 rows |
| getMainAccountById(padded id) | identical | 1 value |
| getMainAccountById(missing) | identical | 1 value |
| getMainAccountByName(every 10th, odd casing) | identical | 40 rows |
| getMainAccountByName(missing) | identical | 1 value |
| getAllAccountsForSubEnrichment (non-empty rows, hashed) | identical | 399 rows |
| getAccountSummaryById(every 10th) | identical | 40 rows |
| getAccountSummaryById(missing / blank) | identical | 2 rows |
| getAccountSummariesByIds(all + a missing one) | identical | 398 rows |
| fetchOnboardingChecklist(each known + one without) | identical | 4 rows |
