# equipment – real headers and row counts

Read-only snapshot taken 2026-10-08 by `scripts/migrate/discover.mjs equipment`. Headers and counts only; no cell values.

| Sheet | Tab | Rows with data | Blank rows | Columns | Formulas |
|---|---|---|---|---|---|
| MAIN | EquipmentCategories | 2 | 0 | 3 | no |
| MAIN | Equipment | 1 | 0 | 16 | no |
| MAIN | EquipmentCheckouts | 1 | 0 | 17 | no |
| MAIN | EquipmentRepairs | 0 | 0 | 9 | no |
| MAIN | EquipmentParts | 0 | 0 | 7 | no |

## EquipmentCategories (MAIN)

2 rows with data, 0 blank rows in between or after, last sheet row 3.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | ID | 2 | 100% | 2 |  |
| B | Name | 2 | 100% | 2 |  |
| C | Active | 2 | 100% | 1 |  |

## Equipment (MAIN)

1 rows with data, 0 blank rows in between or after, last sheet row 2.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | ID | 1 | 100% | 1 |  |
| B | Name | 1 | 100% | 1 |  |
| C | CategoryId | 1 | 100% | 1 |  |
| D | SerialNumber | 0 | 0% | 0 |  |
| E | PurchaseDate | 1 | 100% | 1 |  |
| F | PurchaseCost | 1 | 100% | 1 |  |
| G | Status | 1 | 100% | 1 |  |
| H | CurrentHolderType | 0 | 0% | 0 |  |
| I | CurrentHolderId | 0 | 0% | 0 |  |
| J | CurrentHolderName | 0 | 0% | 0 |  |
| K | ConditionNotes | 1 | 100% | 1 |  |
| L | PhotoURL | 0 | 0% | 0 |  |
| M | CreatedAt | 1 | 100% | 1 |  |
| N | CheckedOutAt | 0 | 0% | 0 |  |
| O | ExpectedReturnAt | 0 | 0% | 0 |  |
| P | NeedsMaintenanceReview | 0 | 0% | 0 |  |

## EquipmentCheckouts (MAIN)

1 rows with data, 0 blank rows in between or after, last sheet row 2.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | ID | 1 | 100% | 1 |  |
| B | EquipmentId | 1 | 100% | 1 |  |
| C | HolderType | 1 | 100% | 1 |  |
| D | HolderId | 1 | 100% | 1 |  |
| E | HolderName | 1 | 100% | 1 |  |
| F | AccountId | 1 | 100% | 1 |  |
| G | CheckedOutAt | 1 | 100% | 1 |  |
| H | ExpectedReturnAt | 0 | 0% | 0 |  |
| I | ReturnedAt | 1 | 100% | 1 |  |
| J | ConditionAtCheckout | 0 | 0% | 0 |  |
| K | ConditionAtReturn | 1 | 100% | 1 |  |
| L | SignedOutByStaffId | 1 | 100% | 1 |  |
| M | SignedOutByStaffName | 1 | 100% | 1 |  |
| N | SignedInByStaffId | 0 | 0% | 0 |  |
| O | SignedInByStaffName | 0 | 0% | 0 |  |
| P | Notes | 0 | 0% | 0 |  |
| Q | WorkOrderNumber | 0 | 0% | 0 |  |

## EquipmentRepairs (MAIN)

0 rows with data, 0 blank rows in between or after, last sheet row 1.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | ID | 0 | – | 0 |  |
| B | EquipmentId | 0 | – | 0 |  |
| C | StartedAt | 0 | – | 0 |  |
| D | CompletedAt | 0 | – | 0 |  |
| E | Description | 0 | – | 0 |  |
| F | Cost | 0 | – | 0 |  |
| G | PerformedBy | 0 | – | 0 |  |
| H | PartsUsed | 0 | – | 0 |  |
| I | Status | 0 | – | 0 |  |

## EquipmentParts (MAIN)

0 rows with data, 0 blank rows in between or after, last sheet row 1.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | ID | 0 | – | 0 |  |
| B | PartName | 0 | – | 0 |  |
| C | CompatibleEquipmentId | 0 | – | 0 |  |
| D | Supplier | 0 | – | 0 |  |
| E | UnitCost | 0 | – | 0 |  |
| F | StockQty | 0 | – | 0 |  |
| G | LowStockThreshold | 0 | – | 0 |  |
