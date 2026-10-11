# To-do

Things Andres has decided on that are not built yet. Newest at the bottom.

## Waiting on Andres

- **Sub Transfer Proposals switch: on hold** (decided October 11, 2026). `DATA_SOURCE_SUB_TRANSFERS` stays unset in Production, so proposals keep running on Apps Script. Andres puts `.env.production.local` back himself and says when. Until then: do not archive the Apps Script deployment and do not remove `GOOGLE_SCRIPT_URL`.

## After the Sub Transfer Proposals switch

- **Accept / Decline per account.** Each button in the proposal email should change only its own account. Today (in Apps Script, and copied on purpose in `lib/pg/sub-transfers.ts`) one tap marks every account of the proposal. Do this as its own change, only after the switch is done and checked, so the switch itself stays a straight copy of the script. The email links already carry `accountName`; `app/api/sub-transfer-response/route.ts` and `respondSubTransferProposal` do not read it yet.

## Kept as is

- **Pay in the proposals list.** The Postgres version reads the sheet's "Proposed Montly Pay" column correctly and shows the real pay (the script's list always said 0). The sheet column is not to be renamed.
