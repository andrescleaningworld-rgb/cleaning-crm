# accounts – real headers and row counts

Read-only snapshot taken 2026-10-07 by `scripts/migrate/discover.mjs accounts`. Headers and counts only; no cell values.

| Sheet | Tab | Rows with data | Blank rows | Columns | Formulas |
|---|---|---|---|---|---|
| MAIN | Accounts | 399 | 443 | 35 | no |
| MAIN | OnboardingChecklist | 3 | 0 | 7 | no |
| MAIN | Account Updates | 193 | 848 | 17 | yes |
| MAIN | Sub Transfer Proposals | 72 | 0 | 15 | no |

## Accounts (MAIN)

399 rows with data, 443 blank rows in between or after, last sheet row 843.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | Account ID | 398 | 100% | 398 |  |
| B | Account Name | 397 | 99% | 394 |  |
| C | Start Date | 395 | 99% | 315 |  |
| D | Service Type | 398 | 100% | 91 |  |
| E | Frequency | 398 | 100% | 86 |  |
| F | Cleaning Days | 214 | 54% | 57 |  |
| G | Key / Alarm / Access Info | 181 | 45% | 7 |  |
| H | Monthly Revenue | 398 | 100% | 230 |  |
| I | Subcontractor | 396 | 99% | 37 |  |
| J | Manager | 396 | 99% | 10 |  |
| K | Monthly Subcontractor Pay | 391 | 98% | 162 |  |
| L | Address | 397 | 99% | 392 |  |
| M | Contact Name | 392 | 98% | 325 |  |
| N | Phone | 394 | 99% | 368 |  |
| O | Scope of Work | 71 | 18% | 71 |  |
| P | Notes | 221 | 55% | 218 |  |
| Q | Status | 398 | 100% | 6 |  |
| R | Cancelled Date | 56 | 14% | 50 |  |
| S | Last Updated / Time Stamp | 68 | 17% | 54 |  |
| T | Account Health | 38 | 10% | 3 |  |
| U | Email | 27 | 7% | 27 |  |
| V | Gross Margin | 70 | 18% | 58 |  |
| W | Gross Margin % | 70 | 18% | 57 |  |
| X | Last Visit Date | 0 | 0% | 0 |  |
| Y | Last Complaint Date | 0 | 0% | 0 |  |
| Z | Last Follow-Up Date | 0 | 0% | 0 |  |
| AA | Open Complaints | 0 | 0% | 0 |  |
| AB | Open / Inactive Notes | 0 | 0% | 0 |  |
| AC | Latitude | 371 | 93% | 360 |  |
| AD | Longitude | 371 | 93% | 360 |  |
| AE | Has Key | 29 | 7% | 2 |  |
| AF | Alarm Code | 7 | 2% | 6 |  |
| AG | City | 368 | 92% | 150 |  |
| AH | Zip | 367 | 92% | 169 |  |
| AI | Checklist Needed | 5 | 1% | 2 |  |

## OnboardingChecklist (MAIN)

3 rows with data, 0 blank rows in between or after, last sheet row 4.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | AccountId | 3 | 100% | 3 |  |
| B | AccountName | 3 | 100% | 3 |  |
| C | ItemsJson | 3 | 100% | 3 |  |
| D | StartedAt | 3 | 100% | 3 |  |
| E | LastUpdatedAt | 3 | 100% | 3 |  |
| F | CompletedAt | 0 | 0% | 0 |  |
| G | AutoStableAppliedAt | 0 | 0% | 0 |  |

## Account Updates (MAIN)

193 rows with data, 848 blank rows in between or after, last sheet row 1042.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | Update ID | 37 | 19% | 37 | formula |
| B | Account ID | 43 | 22% | 33 | formula |
| C | Account Name | 193 | 100% | 109 |  |
| D | Update Date | 192 | 99% | 145 |  |
| E | Update Type | 174 | 90% | 26 |  |
| F | Notes | 193 | 100% | 191 |  |
| G | Created By | 180 | 93% | 5 |  |
| H | Notify Email | 30 | 16% | 3 |  |
| I | Created At | 0 | 0% | 0 |  |
| J | Updated At | 0 | 0% | 0 |  |
| K | Update Title | 0 | 0% | 0 |  |
| L | Details | 0 | 0% | 0 |  |
| M | Entered By | 0 | 0% | 0 |  |
| N | Notify Office | 1 | 1% | 1 |  |
| O | Notify Subcontractor | 1 | 1% | 1 |  |
| P | Follow-Up Needed | 1 | 1% | 1 |  |
| Q | Follow-Up Date | 0 | 0% | 0 |  |

## Sub Transfer Proposals (MAIN)

72 rows with data, 0 blank rows in between or after, last sheet row 73.

| Col | Header | Filled | Filled % | Distinct values | Note |
|---|---|---|---|---|---|
| A | Proposal ID | 72 | 100% | 29 |  |
| B | Created At | 72 | 100% | 29 |  |
| C | Status | 72 | 100% | 4 |  |
| D | New Subcontractor | 72 | 100% | 14 |  |
| E | New Subcontractor email | 72 | 100% | 14 |  |
| F | Account Name | 72 | 100% | 30 |  |
| G | Address | 72 | 100% | 32 |  |
| H | Cleaning Days | 72 | 100% | 14 |  |
| I | Scope | 72 | 100% | 17 |  |
| J | Keys / Alarm | 72 | 100% | 2 |  |
| K | Proposed Montly Pay | 72 | 100% | 24 |  |
| L | Accepted At | 6 | 8% | 6 |  |
| M | Declined At | 4 | 6% | 2 |  |
| N | Notes | 9 | 13% | 4 |  |
| O | Sent At | 42 | 58% | 12 |  |
