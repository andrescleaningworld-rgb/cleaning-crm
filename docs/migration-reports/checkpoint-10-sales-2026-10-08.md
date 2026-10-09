## Checkpoint Area 10 (Sales / Reports) – 2026-10-08

Time: about 0.4 h actual vs 18 h estimate. Total so far: about 8.2 h vs 237 h estimated (areas 0, B, 1 through 10).

**New estimate.** 93 hours are still on the plan; at the measured pace that is about **3 to 10 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- The 2 sales in "Sales & Commissions" are now also in the practice database.
- The app can read and save sales from either place. The switch `DATA_SOURCE_SALES` is **not set**, so the live app still uses Google Sheets.
- **Sales** and **Reports** have the new look (same title bar, big buttons and boxes, status as a pill with a word). Reports has no data of its own: it adds up accounts, visits, complaints and sales, which are all moved now.
- A fix for every redesigned screen: on a phone, a wide table could push a whole screen's content off the right edge, cut off with no way to scroll to it. Wide tables now scroll inside their own box.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| sales (Sales & Commissions) | 2 | 2 | ✓ |

Every row compared field by field (2 × 21): 0 missing, 0 extra, 0 different. Both sales are tied to an account. Parity: 1 read, identical. Over the web, `/api/sales` is byte-identical on both sources.

Saves tested on Postgres: 8 function checks (add a sale, the commission sum, the ID, the link to the account, two in the same second). Test rows were removed.

Not tested:
- **Adding a sale through the screen**, and the two print-outs (quarterly sales report, Reports). The pages open and measure correctly; nothing was clicked that saves.
- With only 2 sales, the comparison proves the plumbing. The function checks cover the cases the sheet does not have yet.

### Found while doing this (worth your attention)
1. **One of your two sales shows as $0.** Its amount sits in an old duplicate column (Q) and the real "Amount Sold" column (H) is empty, so the Sales page shows Sales Total $0 next to Commission Due $24. Type the amount into column H and it corrects itself. (Question 1.)
2. **The sheet has two duplicate columns** left over from an older version: a second "Amount" and a second "Commission Amount". The app keeps the first in step and never touches the second.
3. **A wide table could hide a screen's content on a phone** (see above). I found it on the Sales page from a screenshot, not from my measuring tool, which only checked whether the page scrolls sideways. The tool now also checks for content cut off at the edge, and I re-ran it on Sales, Reports and To-Do.

### Questions for you (data)
1. What was the amount of the sale that shows $0? (Or fix it in the sheet: column H of that row.)

### Feature checklist
| Screen | Before | Now |
|---|---|---|
| Sales | Title, "Showing Q… for …", Print Quarterly Report, filter (year, quarter, salesperson, search), 4 number boxes, commission summary by salesperson, pay period total, Add sale form (account search, service, dates, amount, commission %, status, recurring dates, notes), sales table | Same content in the same order, with kit buttons, boxes, cards and a status pill |
| Reports | Title, period and filter controls, Print, summary boxes, the report tables | Same content in the same order, with kit styles |

Both pages keep their structure (see "Decisions"). Tables stay tables; on a phone they scroll sideways inside their own box.

Measured in a headless browser at 375px and 1280px (Sales, Reports, and To-Do again after the fix): no sideways page scroll, nothing cut off, every button and box at least 48px, no text under 16px. Nothing was saved.

### Proposals awaiting approval (nothing here is built)
1. **Sales: move "Add sale" into a sheet** behind one blue button, and show the sales as cards on a phone.
2. **Reports: cards on a phone** for the summary tables.
3. Delete the two duplicate columns from the sheet after the move (you).
4. Still waiting from earlier: the complaint Edit fix, the To-Do rearrangement, and the rest in the earlier reports.

### Decisions made without you
1. **Sales and Reports were restyled in place, not rearranged.** Both are long pages built around tables and a print-out; every element now uses the shared kit, but nothing moved. Proposals 1 and 2 do the rearranging.
2. Sale status pill: Paid green, Approved and Pending amber, Cancelled red, anything else gray. (Approved was blue.)
3. The kit now stops anything inside a screen from being wider than the screen.

### Protected files edited
None in this area.

### Readers still on Sheets / Apps Script
- None for sales. Reports reads accounts, visits, complaints and sales through their web addresses, so it follows each switch.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Sales**. Title, a filter card, four number boxes, the summary table. Nothing should be cut off at the right; the tables scroll sideways inside their own box.
2. Change Quarter: the numbers and the "Showing …" line change.
3. Open **Reports**. Same check: nothing cut off, tables scroll in place.

### How to undo
Data: leave `DATA_SOURCE_SALES` unset (it is). Screens: revert "migration(sales): step 5 …". Everything: revert the commits whose message starts with `migration(sales)`.
