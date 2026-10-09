## Checkpoint Area 9 (To-Dos) – 2026-10-08

Time: about 0.7 h actual vs 20 h estimate. Total so far: about 7.8 h vs 219 h estimated (areas 0, B, 1 through 9).

**New estimate.** 111 hours are still on the plan; at the measured pace that is about **4 to 12 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- The 127 to-dos and the 44 lines of the text-message log are now also in the practice database.
- The app can read and save to-dos from either place. The switch `DATA_SOURCE_TODOS` is **not set**, so the live app still uses Google Sheets.
- The **To-Do** page has the new look: same title bar as the other screens, big buttons and boxes, status and priority as pills with words.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| todos (To Do) | 127 | 127 | ✓ |
| todo_sms_log (SmsLog) | 44 | 44 | ✓ |

Every row compared field by field (127 × 17, 44 × 8): 0 missing, 0 extra, 0 different. 124 of 127 to-dos are tied to an account.

Parity: 7 reads, 7 identical. Over the web, the to-do list (55,748 bytes) and the text-quota answer are byte-identical on both sources.

Saves tested on Postgres: 29 function checks (add one, add a batch for several accounts, status, edit, bulk edit, outcome, calendar bookkeeping, the text log and its status updates, wrong and missing IDs). Through the web addresses with everything outbound in dry-run: add one, add a batch, status, edit, outcome. 2 texts, 2 push messages and 3 calendar changes were logged and **none were sent**. Test rows, their text-log lines and audit lines were removed.

Not tested:
- **A real text, push message or Google Calendar event.** Dry-run only, as the rules require.
- **The "text delivered?" re-check**, because it asks the text provider. In the screen test I answered those requests locally.
- **Saving through the screen** (Add To-Do, Save, Done, Save Changes, Apply). The forms and modes open; the saves were checked through the web addresses.
- The two print layouts (Task Sheet, By Manager). They were not changed.

### Found while doing this (worth your attention)
1. **Your text-message credit is at 0.** The newest line in the text log says 0 texts left, and the To-Do page shows "SMS quota low (0 left)". **Managers are probably not getting to-do texts right now.** Refill at Textbelt.
2. **The To-Do page asks "was the text delivered?" about a thousand times when it opens.** With 127 to-dos on screen it made 1,016 status requests in my test. That is slow and it is what hits Google's limits. (Proposal 1.)
3. **Every open to-do is overdue**: 28 open, 28 overdue.
4. **Six columns of the To Do sheet have no header** (group, outcome, calendar event, sync to calendar, priority; "Calendar Sync Failed" has one). Nothing breaks, but nobody opening the sheet can tell what they are.
5. Two names in "Assigned to" are not in your Managers list, and one to-do names an account that does not exist under that name.

### Feature checklist: To-Do page
| Before | Now |
|---|---|
| No page title | "To-Do" title bar, like the other screens |
| "SMS quota low" banner with Dismiss | Same |
| Open Google Calendar, Bulk Edit To-Dos, Print Assigned Tasks | Same three buttons |
| 3 number boxes: Open, Overdue, Done | Same |
| New To-Do form: due date, assigned to, account picker (several accounts for a Visit), type, priority, why, notes, Sync to Calendar | Same boxes; **Add To-Do** is the one blue button |
| Search and 5 filters, newest / oldest | Same |
| A card per to-do: type, priority, status, Overdue, Recurring, "Calendar sync failed" badges | Same, as pills with words (priority says "High priority") |
| "Notifying… / ✓ Delivered / ⚠ Failed" with Resend | "Sending text… / Text delivered / Text failed" with Resend |
| Edit (6 fields in the card), In Progress, Done (a Visit asks for the visit details first) | Same |
| Latest update box with Save; Details with Outcome and Save outcome | Same |
| "Open Onboarding Checklist" on onboarding to-dos | Same |
| Bulk edit: tick boxes, "Bulk Edit Selected (n)", a form with 6 "leave unchanged" fields | Same |
| Print: choose Task Sheet or By Manager, "Include completed" | Same |
| Deep link to one to-do (from a text) highlights it | Same, with an amber outline |

The page keeps its structure: forms sit in the page, not in sheets. See "Decisions".

30 screen checks in a headless browser at 375px and 1280px, all passed after one fix (the account picker's button was 42px tall; now 48px). Measured: no sideways scroll, every button and box at least 48px, no text under 16px. Nothing was saved.

### Proposals awaiting approval (nothing here is built)
1. **Ask about text delivery once for the whole page** instead of once per to-do, and only for to-dos that have a text. Faster page, far fewer requests.
2. **Show 25 to-dos at a time** with "Show more" (the page draws all of them today).
3. **Move the New To-Do form and the filters into sheets**, so the page opens on the list and one **Add to-do** button. That is the same pattern as the other redesigned screens; I held back because this is the page your managers use most.
4. Add the six missing column headers to the To Do sheet (you, in the sheet).
5. Still waiting from earlier: the complaint Edit fix, and the rest in the earlier reports.

### Decisions made without you
1. **The To-Do page was restyled, not rearranged.** Every button, box, card and badge now uses the shared kit, but the New To-Do form, the filters and the bulk-edit form stay where they were. Rearranging the most-used page without you seeing it first seemed the wrong call; proposal 3 does it.
2. Open and In Progress both show amber ("waiting on someone"); Done is green, Cancelled gray. Before, Open was blue.
3. The text badge uses words instead of symbols.
4. The account picker got bigger text and a 48px button on both places it is used (this page and the visit pop-up).

### Protected files edited
None in this area.

### Readers still on Sheets / Apps Script
- None for to-dos. Creating a to-do from the Accounts list and from a new complaint goes through the same `/api/to-do`, so both follow the switch.
- `DATA_SOURCE_TODOS` depends on People (manager names and phones), already moved. It can be turned on with the others once the remaining areas are done.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **To-Do**. A title bar, three number boxes, the New To-Do form, then your open to-dos.
2. On a to-do, tap **▼ Details**: the Outcome box appears. Tap **Edit**: six fields appear in the card. Tap **Cancel**.
3. Change the Status filter to "All": you should see all 127.
4. Tap **Bulk Edit To-Dos**: every card gets a tick box. Tick two, tap **Bulk Edit Selected (2)**, look at the form, then tap **Cancel Selection**.
5. Tap **Print Assigned Tasks**: two choices. Tap × to close.
6. **Check your Textbelt credit** (finding 1).

### How to undo
Data: leave `DATA_SOURCE_TODOS` unset (it is). Screens: revert "migration(todos): step 5 …". Everything: revert the commits whose message starts with `migration(todos)`.
