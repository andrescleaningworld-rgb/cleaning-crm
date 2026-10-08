# Parity – customer-portal

Each read function run with `DATA_SOURCE_CUSTOMER_PORTAL=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**13 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| getMergedPortalAccounts | identical | 397 rows |
| listPortalAccounts | identical | 393 rows |
| listPortalSubmissions | identical | 0 rows |
| getPortalNewCount | identical | 1 value |
| getCustomerByPhone(first row with access) | identical | 1 value |
| getCustomerByPhone(last row, typed as (xxx) xxx-xxxx) | identical | 1 value |
| getCustomerByPhone(last row, typed with +1) | identical | 1 value |
| getCustomerByPhone(a phone several rows share) | identical | 1 value |
| getCustomerByPhone(a row with access turned off) | identical | 1 value |
| getCustomerByPhone(unknown phone) | identical | 1 value |
| getCustomerByPortalCode(first row) | identical | 1 value |
| getCustomerByPortalCode(last row, lower case with spaces) | identical | 1 value |
| getCustomerByPortalCode(unknown code) | identical | 1 value |
