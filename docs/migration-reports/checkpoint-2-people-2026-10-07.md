## Checkpoint Area 2 (People) – 2026-10-07

Time: 0.2 h actual vs 11 h estimate. Total so far: 1.4 h vs 43 h estimated (areas 0, B, 1, 2).

**About the estimate:** four parts are done at roughly 3% of their estimated hours. That ratio should not be applied to what is left. These parts had 40 rows of data in total, no Apps Script, and two short screens. Subcontractors, Accounts, To-Dos and the portals have real data problems, Apps Script actions to rebuild without their source, and screens of 1,000+ lines. A fair re-estimate comes after Area 3 (the first hard one). Deadline: not set.

### What changed (plain words)
- The Staff list (15 people) and the Managers list (6 people) are now also in the practice database.
- The app can read and save them from either place. The switch `DATA_SOURCE_PEOPLE` is **not set**, so the live app still uses Google Sheets.
- No screen changed in this area. Staff are managed on the Equipment → Staff screen (Area 5) and managers on the Settings screen (Area 14); those get the new look there.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| staff (Staff) | 15 | 15 | ✓ |
| managers (Managers) | 6 | 6 | ✓ |

Every row compared field by field: 0 missing, 0 extra, 0 different. Parity: 9 reads, 9 identical. Seven web addresses (staff list, manager list, the login name list, To-Dos, and others) returned byte-identical answers on Sheets and on Postgres.

Saves tested on Postgres: add / change / deactivate / delete a staff member, add / change a manager, calendar color, the rule that only an active Manager or OfficeStaff can sign equipment in and out (21 function checks, 6 over the web). Sheets row counts unchanged afterwards.

Also checked: every staff ID used by logins (6), equipment PINs (12) and vehicle drivers (2) exists in the Staff list. No loose ends.

Not tested: a real login with a password (this computer has no staff password; the login code changed by one line, see below).

### Questions for you (data)
Each manager should be tied to their Staff record so the two lists can agree later. Nothing is tied yet. Names are not printed here because this file is saved in the code; open the Managers and Staff tabs side by side.

1. Five managers have exactly one Staff record with the same name. Are they the same people? (Almost certainly yes; say "link the five" and it is done.)
2. One manager has no Staff record with the same name: Manager ID `MGR-21-56-24-o7a84`. Which Staff record is it, if any?

Until answered: nothing breaks. The app does not use this link today.

### Proposals awaiting approval (not built)
1. Merge Staff and Managers into one list of people, with "manages accounts" as a checkbox. Today a manager is typed in twice and the two can drift apart.
2. Managers have Email and Notes columns that are empty for everyone and that no screen shows. Keep or drop?
3. Still waiting from earlier: the name changes (Complaints → Problems and four others) and the button wording on Documents and Extra Services.

### Decisions made without you
1. No manager was linked to a Staff record automatically, even where the name matches exactly.
2. The database does not yet enforce "a login must belong to a real Staff record". All of them do today, but while Staff is still saved in Sheets, enforcing it would block a newly added person from logging in. It gets enforced in the wrap-up, after the switch is on for good.
3. A staff role that is not one of the three known ones is treated as InsideStaff, exactly as the app does now. All 15 have a known role.
4. "Has this person signed equipment in or out?" (the check before deleting a staff member) still asks Sheets even when People is on Postgres, because the equipment history moves in Area 5.

### Protected files edited
Three, each by one import line, no logic changed:
- `lib/managerAccounts.ts`: `fetchStaff` now comes from `@/lib/data/people` (was `@/lib/googleSheets`)
- `app/api/login/route.ts`: same
- `app/api/login/setup-password/route.ts`: same

With the switch off, that new import calls the very same Sheets function as before.

### Readers still on Sheets / Apps Script
For Staff and Managers: none in the Next.js code; all 18 files go through the switch. Unknown: whether the Apps Script backend reads the Managers tab itself (for example when it emails a new-account packet). Its source is not in the repo. This matters at production cutover, not now.

### Click-through test on your phone
No screen changed. To be sure nothing moved, on a preview of this branch:
1. Open the login page. You should see the same list of names as today.
2. Log in as yourself. It should work exactly as before.
3. Open **To-Do → Add**. The "Assigned To" list should show the same managers.
4. Open **Equipment → Staff**. You should see the same 15 people.

### How to undo
Data: leave `DATA_SOURCE_PEOPLE` unset (it is). Code: revert the commits whose message starts with `migration(people)`.
