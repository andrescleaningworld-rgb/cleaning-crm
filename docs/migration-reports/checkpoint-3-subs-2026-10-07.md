## Checkpoint Area 3 (Subcontractors) – 2026-10-07

Time: 0.6 h actual vs 24 h estimate. Total so far: 2.0 h vs 67 h estimated (areas 0, B, 1, 2, 3).

**New estimate.** Five parts are done at about 3% of the estimated hours, and this one was a real test (identity problems, an Apps Script action rebuilt without its source, two screens of 1,000+ lines). Scaling the 263 hours still on the plan by the measured pace gives roughly **8 to 25 hours of Claude Code work** left; the wide range is because Accounts, the two portals and the dashboard are bigger than anything done so far. The slow part is now yours, not the building: answering the questions below and clicking through each area (the plan's estimate of about 21 hours of your time has not shrunk). Deadline: not set.

### What changed (plain words)
- The subcontractor list (39) and the sub portal activity log (385 lines) are now also in the practice database.
- Every subcontractor now has a permanent ID there (SUB-001 … SUB-039). In Sheets the "ID" is only a row number, so inserting a row renumbered everyone below it.
- The app can read and save subcontractors from either place. The switch `DATA_SOURCE_SUBS` is **not set**, so the live app still uses Google Sheets and Apps Script.
- "Add subcontractor" has a Postgres version, so it no longer needs Apps Script once the switch is on.
- New look on: the **Subcontractors** list, the **subcontractor page**, the **Sub Center** tab bar, and the Sub Center **Activity Log**.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| subcontractors (Subcontractors) | 39 | 39 | ✓ |
| sub_activity_log (Subcontractor Activity Log) | 385 | 385 | ✓ |

Every row compared field by field (39 × 18 columns, 385 × 5): 0 missing, 0 extra, 0 different. Parity: 4 reads, 4 identical, including the subcontractor list that Apps Script returns, rebuilt from Postgres and matching the live Apps Script answer on all 39 rows. Five web addresses returned byte-identical answers on both sources.

Saves tested on Postgres: add a sub, change every field, clear a field, wrong and missing IDs (15 function checks, plus add and change through the web address and through the screens). The practice database was re-imported afterwards and matches Sheets again.

Not tested: the map inside the Coverage tab (this computer has no Google Maps key), and a real print-out (the print layout was checked in the browser's print mode).

### Found while doing this (worth your attention)
1. **Most subs never get the automatic texts.** When the app texts a sub (new complaint, account change), it asks Apps Script for the phone number. Apps Script reads the *second* "Phone" column at the far right of the sheet, where only **8 of 39** subs have a number. The normal Phone column, where **28** have one, is ignored for texting. The Postgres version copies today's behavior exactly, so nothing changes until you decide (proposal 1).
2. **The same sub can have two different IDs.** For the last 5 rows of the sheet, Apps Script uses an old "ID" column at the far right (SUB-001, SUB-003, SUB-004, SUB-005, SUB-006), which are also the IDs shown for five *other* subs in column A. The screens use row numbers instead, so they are not affected, but anything that goes through Apps Script could mix them up.
3. **Saving a sub with a blank Status writes "Active".** 27 of 39 subs have no Status. The edit form shows "Active" for them, and saving writes it. Old and new screen behave the same.
4. **Five boxes on the "Add subcontractor" form are never saved**: Score, Complaints, Avg condition, Accounts assigned, Last review. The sheet has no column for them and the score is calculated automatically. They are still on the new form because removing them needs your OK (proposal 2).

### Questions for you (data)
1. **Leo / Anvil Clean is in the list twice** (SUB-004 and SUB-037: same contact, same company, same email). Is it one subcontractor entered twice? Which one do you keep? Until you say, both stay, nothing is merged, and the names "Leo" and "Anvil Clean" point at neither, so his accounts cannot be tied to him automatically.
2. **Three subs have the company name "Cleaning World"** (SUB-006, SUB-007, SUB-008, different contacts). When an account says "Cleaning World", who is it? Left unresolved; their contact names still work.
3. **Giovanna and Cesar are fine as typed.** "Giovanna" matches only G & G Magic Touch (SUB-018) exactly, and "Cesar" matches only Grace Maintenance (SUB-016). The longer names ("Alonso & Giovanna Mendoza", "Cesar Decarvalho") are different subs. The real test comes in Accounts, where the free-text names live; you will get a per-account list there.
4. **Seven subs have their phone only in the far-right Phone column** (which the screens never show). Should those numbers move to the normal Phone column?
5. **19 activity-log lines** come from an email no current sub has. Whose were they? Left unlinked.

### Feature checklist: Subcontractors list
| Before | Now |
|---|---|
| Tabs: Subcontractors / Service Log | Same two tabs |
| "Add New Subcontractor" button opens a form in the page (16 boxes) | Blue **Add subcontractor** at the bottom → sheet with the same 16 boxes |
| Search box + 5 dropdowns in a row (Status, Performance, Accounts, Schedule, Sort) | One search box + **Filter and sort** button → sheet with the same 5 dropdowns and every option; the button shows how many are on |
| "Showing X of Y subcontractors", Clear Filters | Same. Clear filters now also clears Schedule (it used to forget it) |
| Table with 11 columns | Cards on a phone. On a wide screen a table with the same facts in 7 columns (company + contact, score + performance, sub and CW revenue, accounts + complaints, schedule, status, action) |
| Performance badge by color | Color + word + icon |
| View / Edit | **Open** |
| Add Schedule (only when there is none and the sub has an email) | Same |
| "Missing ID" in red | "This row has no ID, so it cannot be opened." |
| Dashes for empty values | Words: "No score", "None", "Not known" |

### Feature checklist: Subcontractor page
| Before | Now |
|---|---|
| "← Back to Subcontractors" | Back arrow in the header |
| Name, "Subcontractor ID: SUB-ROW-20", three badges | Name, contact name, the same three badges with icons. The ID line is gone (it was a row number) |
| Print, Refresh, Edit Subcontractor buttons | **More → Print / Refresh**; blue **Change details** at the bottom |
| 8 number boxes | Same 8 |
| Automatic Performance Score (6 facts + how it is worked out) | Same |
| Subcontractor Details (11 facts) | Same |
| Edit form replaces the details in the page | Edit form opens in a sheet, same 11 boxes, same note that the score cannot be edited |
| Current Accounts and Past / Cancelled Accounts tables (10 and 12 columns) with totals | Same facts and totals. Cards on a phone; on a wide screen 7 or 8 columns |
| Recent Complaints (first 25) | Same |
| Print: hides the numbers, the score and the buttons | Same sections printed and hidden; tables print, not cards |
| "Subcontractor Not Found" | Friendly message with a way back |

### Feature checklist: Sub Center
| Before | Now |
|---|---|
| Four tabs: Subs, Sub Schedules, Coverage, Activity Log; remembers the last one; `?tab=` works | Same, with the new tab bar |
| Activity Log: 2 dropdowns + 2 dates + Clear Filters in the page | **Filter** button → sheet with the same four; shows how many are on |
| "X of Y" count, newest first | Same |
| All lines at once | First 100, then **Show 100 more** |
| Sub Schedules and Coverage tabs | Not redesigned yet: Sub Schedules is Area 6; Coverage and its map read account data and are done with the map in Area 4b |

51 screen checks in a headless browser at 375px and 1280px, 49 passed; the 2 misses were mistakes in the test, not the screens. Screenshots for these screens are **not** saved in the repo because they show real company names and revenue.

### Proposals awaiting approval (nothing here is built)
1. **Text subs at their normal Phone number**, and only fall back to the far-right one. About 20 more subs would start getting the texts they were meant to get.
2. Remove the 5 never-saved boxes from "Add subcontractor".
3. Stop writing "Active" into a blank Status on save, or decide that blank simply means Active everywhere.
4. Delete the leftover far-right columns (ID, Phone, Insurance Expiration) once the phones are moved.
5. Still waiting from earlier: Complaints → Problems and the other name changes; merging Staff and Managers; the button wording on Documents and Extra Services.

### Decisions made without you
1. Leo: both rows kept, nothing merged, name left unresolved.
2. Permanent sub IDs are the numbers shown in column A on Oct 7, 2026; new subs get the next free number.
3. On Postgres, texting a sub uses the same far-right phone column Apps Script uses today.
4. The activity log reads from Postgres only when the Sub portal switch is on too, because new log lines are still written by Apps Script until Area 13.
5. "Add subcontractor" on Postgres saves the details and sends nothing, because nothing suggests Apps Script sends a message when a sub is added. Tell me if it does.
6. The row-number ID was removed from the subcontractor page; an Inactive status now shows gray (it showed green by mistake).
7. Screenshots with customer names or money stay out of the repo.

### Protected files edited
None in this area.

### Readers still on Sheets / Apps Script
- **Sub portal login and "log activity"** still go through Apps Script (Area 13). A sub added while the switch is on could not log in to the portal. **Do not turn `DATA_SOURCE_SUBS` on in production before Area 13 is done.**
- The performance score and the revenue per sub are worked out from Accounts, Complaints and Visits, which are still on Sheets (Areas 4, 7, 8).
- Accounts name their sub in free text; that link is Area 4.

### Click-through test on your phone
On a Vercel preview of this branch (see the preview-database warning in the Checkpoint 0 report):
1. Open **Subcontractors**. You should see a card for each of your 39 subs with a colored performance word.
2. Type "anvil" in the search box. You should see two cards (the double Leo). Clear it.
3. Tap **Filter and sort**, set Performance to "High Risk", tap **Done**. The button should say "(1 on)". Tap **Clear filters**.
4. Tap **Open** on any sub. You should see their name, three colored words, 8 number boxes, and their accounts.
5. Tap **Change details**. The form opens filled in. Tap **Cancel** (saving would write to the real sheet).
6. Tap **More → Print**. The print preview should show details and account tables, no number boxes, no buttons.
7. Open **Sub Center → Activity Log**. You should see the newest logins first. Tap **Filter**, pick Action "Login", tap **Done**: the count should say "182 of 385" (or a little more by then).

### How to undo
Data: leave `DATA_SOURCE_SUBS` unset (it is). Screens: revert the four commits "redesign Subcontractors list page", "redesign Subcontractor detail page", "redesign Sub Center tabs and activity log". Everything: revert the commits whose message starts with `migration(subs)`.
