# Parity – equipment

Each read function run with `DATA_SOURCE_EQUIPMENT=sheets` and `=postgres`, JSON compared (ignoring `sheetRow`).

**13 identical, 0 different.**

| Read | Result | Size / note |
|---|---|---|
| fetchEquipmentCategories | identical | 2 rows |
| fetchEquipmentList | identical | 1 rows |
| getEquipmentById(first) | identical | 1 value |
| getEquipmentById(missing) | identical | 1 value |
| fetchEquipmentCheckouts() | identical | 1 rows |
| fetchEquipmentCheckouts(first item) | identical | 1 rows |
| getOpenCheckoutForEquipment(first item) | identical | 1 value |
| fetchEquipmentRepairs() | identical | 0 rows |
| fetchEquipmentRepairs(first item) | identical | 0 rows |
| getOpenRepairForEquipment(first item) | identical | 1 value |
| fetchEquipmentParts | identical | 0 rows |
| staffHasEquipmentCheckoutHistory(first signer) | identical | 1 value |
| staffHasEquipmentCheckoutHistory(nobody) | identical | 1 value |
