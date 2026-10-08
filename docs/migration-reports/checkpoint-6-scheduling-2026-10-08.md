## Checkpoint Area 6 (Scheduling) – 2026-10-08

Time: about 0.8 h actual vs 22 h estimate. Total so far: about 5.6 h vs 163 h estimated (areas 0, B, 1, 2, 3, 4a, 4b, 5, 6).

**New estimate.** 167 hours are still on the plan; at the measured pace that is about **6 to 18 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- The 298 sub schedules, the schedule exceptions (none yet) and the visits subs log from their portal (1) are now also in the practice database.
- The app can read and save them from either place. The switch `DATA_SOURCE_SCHEDULING` is **not set**, so the live app still uses Google Sheets.
- New look on **Sub Schedules**: the list, the Add schedule, Edit schedule and Exception forms, and the Full Calendar (month, week, agenda).
- The search-and-pick box used on several screens (customer, subcontractor) has the new look everywhere it appears.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| sub_schedules (SubSchedules) | 298 | 298 | ✓ |
| schedule_exceptions (ScheduleExceptions) | 0 | 0 | ✓ |
| subcontractor_visits (subcontractor-visits) | 1 | 1 | ✓ |

Every row compared field by field (298 × 17 columns): 0 missing, 0 extra, 0 different. Parity: 7 reads, 7 identical. Three admin web addresses returned byte-identical answers on both sources (the schedule list is 138,975 bytes on each).

Links worked out at import: all 298 schedules point at a real account; 271 point at a current subcontractor.

Saves tested on Postgres: 25 function checks (add, edit, pattern change that closes the old row and starts a new one, replacing a sub's schedule, exceptions add / edit / delete, sub visits add / edit / delete). Test rows were removed; the practice database matches Sheets again.

Not tested:
- **Saving through the screens.** The forms open and stop you when something is missing; Create, Save, Deactivate and Remove were not clicked. A new schedule emails the subcontractor (it would go to the dry-run log here).
- **The subcontractor portal's schedule tab and the customer portal's schedule.** Same functions underneath, but both need a portal login. They are redesigned in Areas 11 and 13.
- The Google Calendar sync that follows some schedule changes (dry-run only).

### Found while doing this (worth your attention)
1. **27 schedules belong to an email no current subcontractor has.** All 27 use the same one email. The schedules still work (the app matches by that text), but the list shows the email instead of a name, and that sub cannot be tied to them. Did a sub change their email? (Question 1.)
2. **All 298 schedules say "Active".** Not one has ever been deactivated or replaced, and there are no exceptions yet. Either the feature is new or nobody uses those two actions.
3. **The exceptions sheet has a column with no header**: the code writes "created date" into column I, but the header row stops at H. Harmless, just untidy.
4. **Every admin's edits are signed with a name typed into a box** ("Your name"), kept only in that browser. Anyone can type any name. The app already knows who is logged in. (Proposal 1.)

### Questions for you (data)
1. **Which subcontractor owns those 27 schedules?** I can list the accounts for you in the app (Sub Schedules → search the email). Tell me the sub and I record the link; nothing is merged.

### Feature checklist: Sub Schedules
| Before | Now |
|---|---|
| "Your Name (for edits)" box, remembered in the browser | Same |
| Three round buttons: Sub Schedules, Schedule Exceptions, Full Calendar | Same three, as chips |
| Customer and Subcontractor search boxes; nothing shows until you pick one | Same |
| "Couldn't load Subcontractors… Retry" | Same, as a message with **Try again** |
| "+ Add Schedule" / "+ New Exception" | Blue main button at the bottom: **Add schedule** / **New exception** |
| Schedules table, 9 columns | Same 9 columns on a wide screen; cards on a phone |
| Status badge | Color + word + icon |
| Edit / Deactivate / Reactivate links | **Change** button; Deactivate / Reactivate button |
| Exceptions table, 8 columns; Edit / Delete | Same 8 columns or cards; **Change** / **Remove** |
| Delete asks with a browser pop-up showing the exception's ID | Asks with a sheet that names the customer and the date |
| Deep link from the Subs list ("Add schedule" for a sub) | Same |

### Feature checklist: forms
| Form | Before | Now |
|---|---|---|
| Add schedule | Customer, subcontractor, how often; day buttons; a time window per day; week / weekday pickers for monthly; note for As Needed; Create off until complete | Same, in a sheet. Days and time windows are big chips |
| Edit schedule | AccountID and SubID shown raw; frequency; day / time window or week / weekday / time window; status; effective date (pattern change) or start and end; who submitted and edited | Same boxes in a sheet. The header shows the customer's name and the sub instead of the two raw IDs |
| Exception | Customer (new) or its name; original date; type; new date and time window for a reschedule; reason; who created it | Same, in a sheet |

All three keep their own checks and send the same request.

### Feature checklist: Full Calendar
| Before | Now |
|---|---|
| Four filter buttons (Subcontractor, Account, Frequency, Manager) with small drop-down tick lists | Four buttons that each open a sheet with the same tick list, search and Clear; the button shows how many are ticked |
| Month / Week / Agenda, remembered | Same |
| ‹ Prev, Today, Next ›, and the month or week shown | Same |
| Month: a 7-column grid on every screen | The grid on a wide screen. **On a phone the same month shows as a day-by-day list**, because seven columns do not fit |
| Week: one column on a phone, seven on a wide screen | Same |
| Each visit: account, sub and time window, frequency, in 10–12px text; tap to jump to that account's schedules | Same three lines at 16px; same jump |
| "As Needed" list | Same |

58 screen checks in a headless browser at 375px and 1280px, all passed (two first-run misses were timing in the test). Every screen and sheet measured: no sideways scroll, every button and box at least 48px, no text under 16px. Nothing was saved.

### Proposals awaiting approval (nothing here is built)
1. **Sign edits with the logged-in person's name** and remove the "Your name" box.
2. Add the missing "CreatedDate" header to the exceptions sheet (you, one cell).
3. Still waiting from earlier: the equipment return fix; Keys tab; Account Health; Apps Script source; and the rest in the earlier reports.

### Decisions made without you
1. The 27 schedules with an unknown email stay unlinked.
2. In the new database a deleted exception or sub visit is really removed (Sheets leaves an empty row behind).
3. The month view on a phone is a list, not a grid.
4. The browser pop-up before deleting an exception became a sheet.
5. Edit schedule shows the customer's name, not the raw account ID.
6. The search-and-pick box was restyled once, for every screen that uses it.

### Protected files edited
None. (The subcontractor portal page shows schedule tabs of its own; they were not touched.)

### Slips (mine)
- My local test login lasts 12 hours and ran out during this area. One comparison quietly saved the login page instead of data. The answer sizes gave it away (three different lists, all about 18,600 bytes); I renewed the login and ran it again. The comparison is now only trusted when the answers are real data.

### Readers still on Sheets / Apps Script
- `/api/subcontractors` (used here to show sub names) still makes one Apps Script call that is slow or fails now and then; the screen says so and offers Try again. Same as before.
- The sub portal writes schedules and visits through the same switch, so nothing is left behind, but **do not turn `DATA_SOURCE_SCHEDULING` on in production before Area 13** (the sub portal) is checked with a real sub login.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Sub Center → Sub Schedules**. You should see "Search to see results".
2. Type two letters of a customer in **Customer**, tap a name. Its schedules appear as cards with a green **Active**.
3. Tap **Change**. The form slides up, filled in. Tap **Cancel**.
4. Tap **Add schedule**. Pick "Weekly": seven day chips appear. Tap one: four time windows appear. Tap **Cancel**.
5. Tap **Full Calendar**. On your phone you get the month as a list of days. Tap **Week**, then **Next ›**, then **Today**.
6. Tap **Frequency**, tick one, tap **Done**. Fewer visits, and the button says "Frequency (1)".
7. Tap any visit. You land back on that customer's schedules.

### How to undo
Data: leave `DATA_SOURCE_SCHEDULING` unset (it is). Screens: revert "migration(scheduling): step 5 …". Everything: revert the commits whose message starts with `migration(scheduling)`.
