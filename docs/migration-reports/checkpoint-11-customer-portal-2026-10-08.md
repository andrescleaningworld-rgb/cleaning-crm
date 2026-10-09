## Checkpoint Area 11 (Customer portal) – 2026-10-08

Time: about 0.8 h actual vs 22 h estimate. Total so far: about 9.0 h vs 237 h estimated (areas 0, B, 1 through 11).

**New estimate.** 71 hours are still on the plan; at the measured pace that is about **3 to 8 hours of Claude Code work**. Deadline: not set.

### Read this first: four things about customer logins
These are about what customers (and strangers) can do today on the live site. Two are fixed on this branch; two need your decision.

1. **Fixed here: anyone could open one customer's account without a phone number.** The older portal (`/customer-portal`) looks an account up by phone only. If the "phone" sent had no digits in it at all, the server matched the first portal row that has access on and an empty phone, and sent that account back (name, address, estimated monthly total, manager phone, and its portal code). Two rows are in that state (sheet rows 379 and 385). I checked it locally: 200 with an account before, "no account found" after. The login page itself always demanded 10 digits, so no real customer used this path.
2. **Not fixed, your call: the older portal has no password.** Whoever knows a customer's phone number sees that customer's account and gets their portal code in the answer. The newer portal (`/portal`) asks for phone **and** code.
3. **Not fixed, your call: the portal code is the Account ID** on 392 of 393 rows (that is how "Enable" creates it). It is not a secret; it is shown at the bottom of every portal form.
4. **Fixed here: a wrong login showed "Something went wrong"** instead of "Invalid credentials" (every wrong try after the first since the server last started). And the server no longer writes the typed phone and code into its log.

### What changed (plain words)
- The 393 rows of the portal access list are now also in the practice database. The three request tabs are empty in the sheet, so there was nothing to copy.
- The app can read and save portal access and portal requests from either place. The switch `DATA_SOURCE_CUSTOMER_PORTAL` is **not set**, so the live app still uses Google Sheets.
- New look, same features: **Portal Requests**, **Settings → Portal**, the customer portal (`/portal`: login, dashboard, four request forms) and the older customer portal (`/customer-portal`: login, My Account, Requests, Complaints, History).

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| portal_access (customer-portal) | 393 | 393 | ✓ |
| portal_requests (3 request tabs) | 0 | 0 | ✓ |

Every row compared field by field (393 × 20): 0 missing, 0 extra, 0 different. 391 rows are tied to an account; 319 have access on. Parity: 13 reads identical (all values compared as fingerprints, none printed). Over the web, 4 addresses are byte-identical on both sources.

Saves tested on Postgres: 24 function checks, then end to end through the real pages with **one made-up customer** (phone 555-010-0001): wrong code refused, login, dashboard, all four kinds of request, the staff list, a status change. Emails were dry-run. The made-up row and its requests were removed.

Not tested:
- **A login on the Sheets source.** It needs a real customer's phone and code; I do not type those.
- **A photo upload**, and **a submit on the older portal** (those go to Apps Script, which I never write to).
- **Enable, Disable and Generate New Code on a real row** in Settings → Portal. The functions behind them passed; the buttons were not pressed. Edit was opened and cancelled.

### Found while doing this (worth your attention)
1. The four login items above.
2. **30 customers cannot log in to `/portal`.** 19 phone numbers are shared by 49 rows with access (one number is on 7 rows). The login always looks at the first row with that phone, so the other rows' codes are refused. The sheet rows are listed in `migration_issues`. (Question 2.)
3. **A billing request from `/portal` fails today.** The sheet has no `portal-billing-requests` tab, so the save errors and the customer sees "Failed to submit". On Postgres it saves.
4. **Nobody has ever sent anything through `/portal`:** all three request tabs are empty. Together with the menu links pointing at `/customer-portal`, that suggests the older portal is the one customers use. (Question 1.)
5. **Settings → Portal "Edit" never opened** on the old page (a mismatch in how the open row was remembered), so phone, next service, estimated total and "Generate New Code" could not be reached from the app. It opens now.
6. After sending a request on `/portal`, the customer was sent back to the dashboard with no word that it worked. The dashboard now says "Your … was sent."
7. Two rows are tied to no account, two account names appear twice, one portal code is used twice (rows in `migration_issues`).
8. Still true from Area 7: "Your Visit Schedule" on `/portal` is always empty, because that read looks at the wrong columns.

### Questions for you
1. **Which customer portal do customers really use, `/customer-portal` or `/portal`?** I kept and restyled both.
2. The 19 shared phone numbers: should those customers log in by code alone, or should each row get its own phone?
3. Should the older portal ask for the code too (or be retired)? Should "Enable" make a random code instead of the Account ID?

### Feature checklist
| Screen | Before | Now |
|---|---|---|
| Portal Requests | Title + New badge, 4 number boxes, search, 5 kind buttons, 5 status buttons, rows that unfold with details, photo links, Status, Staff Notes, Save, Cancel | Same. Kind and Status are two pickers. A row opens a sheet with the details, Status, Staff Notes, Save. A failed save shows in the sheet with Retry (was a pop-up) |
| Settings → Portal | Back to Settings, title, 3 number boxes, search, access filter, status filter, "x of y", table with code + Copy, Enable / Disable / Edit, edit panel (phone, next service, estimated total, code, Generate New Code, Save Changes) | Same. Cards on a phone, table when wide. The two filters are pickers. Edit is a sheet (and opens now) |
| /portal login | Logo, title, phone, code + hint, error, Sign In, help line | Same |
| /portal dashboard | Welcome + Log Out, status, service details, schedule, visit calendar + upcoming visits, service schedule, scope, address, billing, 4 quick actions, Log Out | Same. Quick actions moved up under the status; "was sent" line added |
| /portal forms (4) | Back, title, "Submitting for", fields, photos (complaints), error, Submit, Account ID | Same. Photos use the shared photo picker |
| /customer-portal (5 pages) | Login by phone; My Account (status boxes, 2 quick actions, recent visits, financials, contact, open issues, pending requests); Requests (with the specialty service picker); Complaints; History | Same content in the same order, with kit styles |

Measured in a headless browser at 375px and 1280px, every screen and both sheets: no sideways scroll, nothing cut off, every button and box at least 48px, no text under 16px. 84 of 84 checks passed. Screenshots are not committed.

### Proposals awaiting approval (nothing here is built)
1. Close the older portal's phone-only login (ask for the code, or retire `/customer-portal`).
2. Random portal codes instead of the Account ID; stop sending the code back to the browser.
3. Let a customer whose phone is shared log in (match by code first).
4. Fix the customer visit read so "Your Visit Schedule" shows visits (from Area 7).
5. Give portal access rows a proper link to the account instead of matching by name.
6. Still waiting from earlier reports: the complaint Edit fix, the To-Do rearrangement, Sales and Reports cards on a phone.

### Decisions made without you
1. **Both portals are treated as live** and both were restyled. Say which one to retire.
2. **The no-digits lookup is closed on both sources** (item 1 at the top). Undo: 4 lines in `app/api/customer-portal/route.ts`.
3. **Wrong-login answer fixed; login values no longer logged.** Undo: `app/api/portal/login/route.ts`.
4. Settings → Portal "Edit" opens; the `/portal` dashboard says when a request was sent.
5. Billing requests save on Postgres even though the sheet has no tab for them.
6. The older portal's requests, complaints and history stay on Apps Script (its source is not in the repo).
7. Complaint photos: at most 20 per report (there was no limit).
8. Portal Requests status colors: New red, In Progress amber, Resolved green, Closed gray. (In Progress was blue.)
9. A local-only `PORTAL_SESSION_PASSWORD` was added to the git-ignored `.env.development.local`.

### Protected files edited
None in this area. (`app/api/portal/login/route.ts` is the customer login, not the staff login under `app/api/login/`.)

### Readers still on Sheets / Apps Script
- `/customer-portal` requests, complaints and history: Apps Script (see decision 6).
- Photo uploads from `/portal`: Google Drive.
- With the switch on, Settings → Portal reads the accounts from Postgres too, so turn this switch on only together with (or after) `DATA_SOURCE_ACCOUNTS`.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Portal Requests**. Four number boxes, a search box, two pickers. With no requests yet it says "No requests yet".
2. Open **Settings → Customer Portal Access**. Search an account. Tap **Edit**: a sheet slides up with phone, next service, estimated total and the code. Tap Cancel.
3. Open `/portal/login` in a private window. Type a wrong code twice: both times it should say "Invalid credentials".
4. Log in to `/portal` with a test customer. The dashboard shows Quick Actions near the top; open **Change Date** and check that nothing is cut off.
5. Open `/customer-portal/login`, log in with a test customer's phone. My Account, Requests, Complaints and History open; nothing is cut off.

### How to undo
Data: leave `DATA_SOURCE_CUSTOMER_PORTAL` unset (it is). Screens: revert "migration(customer-portal): step 5 …". Everything: revert the commits whose message starts with `migration(customer-portal)`.
