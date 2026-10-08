# Parity – todos

Each read function run with `DATA_SOURCE_TODOS=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**7 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| fetchToDos | identical | 127 rows |
| fetchSmsLogForToDo(most attempts) | identical | 3 rows |
| fetchSmsLogForToDo(one attempt) | identical | 1 rows |
| fetchSmsLogForToDo(no attempt) | identical | 0 rows |
| fetchSmsLogForToDo(blank) | identical | 0 rows |
| fetchSmsLogForToDo(unknown) | identical | 0 rows |
| fetchLatestSmsQuota | identical | 1 value |
