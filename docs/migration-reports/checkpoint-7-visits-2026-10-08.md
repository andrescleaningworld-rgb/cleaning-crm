## Checkpoint Area 7 (Visits) – 2026-10-08

Time: about 0.8 h actual vs 18 h estimate. Total so far: about 6.4 h vs 181 h estimated (areas 0, B, 1, 2, 3, 4a, 4b, 5, 6, 7).

**New estimate.** 149 hours are still on the plan; at the measured pace that is about **5 to 16 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- All 611 visits and the 6 "who edited this visit" lines are now also in the practice database.
- The app can read and save visits from either place. The switch `DATA_SOURCE_VISITS` is **not set**, so the live app still uses Google Sheets and Apps Script.
- With the switch on, the visit list and **Add visit** no longer need Apps Script. On my side the live Apps Script took 37 seconds to answer once and timed out once; the same list from the database comes back at once.
- New look on **Visits** (list), the **visit page** and **Add visit**.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| visits (Visits) | 611 | 611 | ✓ |
| visit_edit_log (VisitEditLog) | 6 | 6 | ✓ |

Every row compared field by field (611 × 14 columns): 0 missing, 0 extra, 0 different.

The visit list Apps Script returns was rebuilt from the database and compared with the live answer: **611 of 611 rows identical**, same order, same names for every field. Parity on the direct reads: 19 of 19 identical. Over the web: the list from the database is byte-identical to what the app returns for the live answer (268,430 bytes), and three single-visit addresses are byte-identical on both sources.

Saves tested on Postgres: 23 function checks (add visit, IDs, dates, edit, edit history, wrong and missing IDs), plus add, edit and edit history through the web addresses. Test rows were removed; the practice database matches Sheets again.

Not tested:
- **Saving through the screens** (Save visit, Save changes). The forms open and stop you when something is missing; the saves were checked through the web addresses instead.
- **Whether Apps Script sends a message when a visit is added.** Its code is not in the project. Nothing suggests it does. If you get an email or text today when someone adds a visit, tell me: the new version sends nothing.
- A real print-out.

### Found while doing this (worth your attention)
1. **The customer portal's "your visits" has never shown anything.** The code reads the wrong columns of the Visits sheet: it looks for the customer's name where the sheet holds a made-up ID, so it never finds a match. Customers see an empty list. Copied as it is for now. (Proposal 1.)
2. **A visit's "Account ID" is really its row number.** The sheet builds it with a formula ("ACC-" plus the row number). It matches no account and would change if a row were ever inserted or sorted. The app already ignores it and finds the account by name. In the new database visits are tied to the real account: 553 of 611.
3. **58 visits name an account that does not exist under that exact name** (36 different names: renamed, closed or misspelled accounts). On the visit page they show "no matching account on file".
4. **The Subcontractor box on Add visit is never saved.** The sheet has no column for it; the list's Subcontractor column and filter are always empty. (Proposal 2.)
5. **The Visits sheet has 737 empty rows** between real ones (611 visits spread over 1,348 rows).
6. **One visit has no account name and no date.** It shows in the list and cannot be opened.
7. **"Follow-up date" exists twice** in the sheet (columns I and M); only M is used.

### Questions for you (data)
1. The 36 account names on visits that match no account: do you want the list? I can link each to the right account once you tell me which, without touching the sheet.

### Feature checklist: Visits list
| Before | Now |
|---|---|
| "+ Add Visit" and "Print" buttons | Blue **Add visit** at the bottom; **More → Print** |
| Account and Sub dropdowns at the top, and again in a filter panel with Completed by, Status, two dates | One **Filter and sort** sheet with all of them once: Account, Subcontractor, Completed by, Status, From, To, Sort. The button shows how many are on |
| Search box | Same (it searches account, manager, type and notes, as before) |
| Clear Filters | Same |
| 3 number boxes; the first says "Loaded from Google Sheets" | Same 3 boxes, without that line |
| Sort: Most Recent / Account A–Z | Same, inside the sheet |
| All visits at once (611 cards) | First 50, then **Show 50 more**. Print still prints all of them |
| Cards on a phone, 9-column table on a wide screen; tap anywhere on a row | Same cards and columns; **Open** button on a card, the account name is the link in the table |
| "ID: ACC-…" under each name | Gone |
| Condition badge by color | Color + "Condition 8" + icon; green for 8 and up, amber for 7, red below, gray with no score |

### Feature checklist: Visit page
| Before | Now |
|---|---|
| "Back to Visits", "Edit Visit" | Back arrow; blue **Edit visit** |
| 9 facts in a grid; the account links to its page when one matches | Same 9 facts, same link, same note when no account matches |
| Editing turns the grid into a form in place; Cancel / Save Changes | The form opens in a sheet: your name plus the same 7 boxes |
| Needs your name before saving | Same |
| Edit History: last edit, "Show full history (n)" | Same |

### Feature checklist: Add visit
| Before | Now |
|---|---|
| 9 boxes: date, account (type to search), manager, subcontractor, type (7), score (12 choices), follow-up needed, follow-up date, notes | Same 9 boxes and choices |
| Picking an account fills manager and subcontractor; opening from an account pre-fills it | Same |
| Save Visit, Cancel | Blue **Save visit**; back arrow |
| The browser's own "please fill out this field" bubbles | The form's own messages ("Please select or enter an account name.") |
| After saving, back to the list | Same |

48 screen checks in a headless browser at 375px and 1280px, all passed (one first-run miss was the test opening the visit that has no account). Every screen and sheet measured: no sideways scroll, every button and box at least 48px, no text under 16px. Nothing was saved by the screen tests.

### Proposals awaiting approval (nothing here is built)
1. **Fix the customer portal's visit list** so customers see their visits (read the right columns). Decide first whether you want customers to see manager visits at all.
2. **Remove the Subcontractor box from Add visit**, or store it (one new column, new database only).
3. Hide **Open** on a visit that cannot be opened.
4. Delete the empty duplicate "Follow-up Date" column and the empty rows (you, in the sheet, after the move).
5. Still waiting from earlier: see the Area 4a–6 reports.

### Decisions made without you
1. Add visit on the new database sends nothing to anyone.
2. The customer-portal visit read is copied with its mistake.
3. Visits with an unknown account name stay unlinked.
4. Two visits saved in the same second get different IDs (Apps Script would give them the same one).
5. The list shows 50 at a time.
6. The raw "ACC-…" line was removed from the list.
7. Editing a visit happens in a sheet.

### Protected files edited (standing approval for this branch)
- `app/visits/page.tsx`: new layout only. The loading, filtering, sorting and status rules are unchanged; added a filter sheet, 50-at-a-time paging and print-all.
- `app/visits/[id]/page.tsx`: new layout only. Loading, the account lookup by name, the edit request and the "your name" rule are unchanged; the edit form moved into a sheet.

### Slips (mine)
- **I hit Google's read limit for about a minute.** One of my comparison reads asked the Sheets API for the whole Visits tab 611 times in a row. Google refused further reads for about a minute. Nothing was written. If the live app uses the same Google account, it may have been slow or shown load errors during that minute (about 10:05). I removed that read and capped these comparisons at under 20 reads.

### Readers still on Sheets / Apps Script
- Inside `lib/googleSheets.ts` other areas still read the Visits tab directly (the subcontractor performance score, the dashboard counts). They move with their own areas.
- Completing a to-do with a visit (To-Do page) posts to the same `/api/visits`, so it follows the switch.
- **Do not turn `DATA_SOURCE_VISITS` on in production before the remaining areas are done**: visits added in the database would be invisible to the parts that still read the sheet.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Visits**. Three number boxes and 50 cards, newest first.
2. Tap **Filter and sort**, set Status to "Missed", tap **Done**. The button says "(1 on)" and the cards say "No score". Tap **Clear filters**.
3. Tap **Open** on a card. Nine facts and **Edit History**.
4. Tap **Edit visit**. The form slides up, filled in. Tap **Cancel**.
5. Go back, tap **Add visit**. Type a few letters in Account and pick one: Manager and Subcontractor fill in by themselves. Go back without saving.

### How to undo
Data: leave `DATA_SOURCE_VISITS` unset (it is). Screens: revert "migration(visits): step 5 …". Everything: revert the commits whose message starts with `migration(visits)`.
