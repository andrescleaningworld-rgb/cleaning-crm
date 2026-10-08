# Parity – people

Each read function run with `DATA_SOURCE_PEOPLE=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**9 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| fetchStaff | identical | 15 rows |
| getStaffById(each) | identical | 15 rows |
| getActiveSigningStaffById(each) | identical | 15 rows |
| getStaffById(missing) | identical | 1 value |
| getStaffById(blank) | identical | 1 value |
| fetchManagers | identical | 6 rows |
| fetchManagers sheetRow numbers | identical | 6 rows |
| getManagerCalendarColorId(each name, odd casing) | identical | 6 rows |
| getManagerCalendarColorId(unknown) | identical | 1 value |
