## Checkpoint Area 12 (Supplies) – 2026-10-08

Time: about 0.5 h actual vs 24 h estimate. Total so far: about 9.5 h vs 237 h estimated (areas 0, B, 1 through 12).

**New estimate.** 47 hours are still on the plan; at the measured pace that is about **2 to 6 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- The supply list (51 items) and the supply orders (13 rows) are now also in the practice database. Until now the app could only reach them through Apps Script.
- With the switch `DATA_SOURCE_SUPPLIES` on, the Supplies and Supply Orders screens read and save in the database and Apps Script is not called. The switch is **not set**, so the live app works as before.
- **Supplies** has the new look: cards on a phone, a table when wide, Add and Edit in a sheet, Remove asks first in a sheet (it was a browser pop-up).
- **Supply Orders** has the kit look, in the same layout as before. The printed purchase order and its PDF were not touched.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| sub_supplies (Supplies) | 51 | 51 | ✓ |
| sub_supply_orders (Supply Orders) | 13 | 13 | ✓ |

Every row compared field by field (51 × 14 and 13 × 15): 0 missing, 0 extra, 0 different. All 13 orders are tied to a subcontractor and to an account.

The two lists the app shows were rebuilt from the database and compared with the live Apps Script answers: **51 of 51 and 13 of 13 rows identical**, same fields in the same order. Over the web, the 3 addresses are byte-identical on both sources.

Saves tested on Postgres: 23 function checks, then through the screens (add, edit, remove a supply; create an order, change its status in the row, open its detail). The office email for a new order was dry-run. Test rows were removed; Team Hub's supply tables were checked untouched (21 / 1 / 7 rows before and after).

Not tested:
- **Saves on the Sheets side.** They go to Apps Script, which I never write to.
- **An order sent by a sub from the sub portal.** That path goes through the sub portal's own address and is wired in Area 13.
- **Generate PO, Share and Download PDF.** The buttons are there and measured; none was pressed (Share opens the phone's share sheet, Generate PO opens the print dialog).

### Found while doing this (worth your attention)
1. **Stock, Minimum and Last Updated on the Supplies page always show "-".** The list the page gets never carries them, so "Low Stock" is always 0 and the low-stock columns in the sheet are empty. On Postgres an edit no longer wipes a stored stock number, but the page still cannot show it. (Proposal 1.)
2. **Editing a supply copies its description into Notes.** The list answers the description in the notes field when Notes is empty, and the edit form saves it back. Same on both sources.
3. **9 of the 13 orders name an item that is not in the supply list today** (renamed items or "Other"), and 5 quantities are text such as "8 boxes". Orders keep the item name as text, so nothing breaks.
4. **An order's items are not tied together.** The portal sends a group id for a multi-item order, but the sheet has no column for it, so the purchase order groups rows by date, account and sub. Postgres keeps the group id for new orders.
5. **Only 4 of 51 supplies have a unit, 3 have a category.**
6. One of the script's three "list supplies" actions does not exist (`getSupplies`); the app only falls back to it, so nothing is broken.

### Questions for you
1. Do you want stock tracking (current stock, minimum, low-stock warning) to work, or should those columns go?
2. Supplies and Team Hub each have their own supply list (51 items here, 21 there). Keep two lists, or make one? I kept them apart.

### Feature checklist
| Screen | Before | Now |
|---|---|---|
| Supplies | Title, Supply Orders link, Add Supply / Cancel, 3 number boxes, search, saved / error line, form (item, category, description, unit, status + hint, current stock, minimum stock, notes), list with supply + description + notes, category, unit, stock + Low, minimum, status, last updated, Edit, Remove (browser pop-up) | Same. Add Supply is the one blue button; the form is a sheet; Remove asks in a sheet; cards on a phone |
| Supply Orders | Title, order-group picker, Generate PO, Share or Download PDF, Refresh Orders, Back to Supplies, 5 number boxes, search + 3 filters, table (date, sub, account, supply, qty, delivery, status picker, notes), row detail pop-up with Admin Approval | Same content in the same places, with kit buttons, boxes and a status pill with a word |
| Printed purchase order, PO PDF | – | Not changed |

Measured in a headless browser at 375px and 1280px (both screens, both sheets, the detail pop-up): no sideways page scroll, nothing cut off, every button and box at least 48px, no text under 16px. 42 of 42 checks passed. Screenshots are not committed.

### Proposals awaiting approval (nothing here is built)
1. Send stock, minimum and last updated to the Supplies page so the columns and "Low Stock" work.
2. Stop the description being copied into Notes on edit.
3. Supply Orders: cards on a phone instead of a wide table; the detail as a sheet.
4. One supply list shared with Team Hub (needs a name-by-name match from you).
5. Still waiting from earlier reports (customer login items, complaint Edit fix, To-Do rearrangement, and the rest).

### Decisions made without you
1. **Supplies got their own two tables and were not merged into Team Hub's supply tables.** Those belong to Team Hub and Crew Link, hold a different list, and matching by name would be an automatic merge.
2. **What the database saves write is my reading of the sheet**, because the Apps Script source is not in the repo: a new item gets Active "yes" and a Last Updated time; Remove sets Status "Inactive" and Active "no"; a new order gets a `SUPORD-…` id and status "New" when none is sent.
3. **The new-order email on Postgres goes to the two office addresses** (the ones every existing order row names), as 9 plain lines. The Apps Script wording is unknown.
4. On Postgres an edit that sends no stock number leaves the stored one alone.
5. Supply Orders was restyled in place, not rearranged (it is built around a table and the purchase order).
6. Status colors: Active, Approved, Completed green; Office Only, Needs Review (supplies), Pending amber; Needs Review (orders), Denied, Cancelled red; anything else gray. (Unknown statuses were blue.)

### Protected files edited
None in this area.

### Readers still on Sheets / Apps Script
- The sub portal's "order supplies" (Area 13).
- The dashboard's new-orders count reads the same address as the Supply Orders screen, so it follows the switch.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Supplies**. Three number boxes, a search box, the list as cards. Nothing should be cut off.
2. Tap **Add Supply**: a sheet with eight fields. Tap Cancel.
3. Tap **Remove** on any supply: a sheet asks first. Tap Cancel.
4. Open **Supply Orders**. Five number boxes; the table scrolls sideways inside its own box. Tap a row: the detail opens; tap Done.

### How to undo
Data: leave `DATA_SOURCE_SUPPLIES` unset (it is). Screens: revert "migration(supplies): step 5 …". Everything: revert the commits whose message starts with `migration(supplies)`.
