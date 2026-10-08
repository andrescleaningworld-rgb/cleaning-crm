## Customer portal redesign – 2026-10-08

Built on branch `migration/postgres`, practice database only. Time: about 1.6 h.

### Read this first
1. **Only 19 of the 311 customers with portal access can log in with an email today.** The login you chose uses the email on the account, and most accounts have none. 292 active accounts with portal access have no email (372 accounts in all, counting cancelled ones and ones without access). The list is on your computer, not in the repo, because it has customer names: `docs/migration-reports/private/accounts-without-email.csv` (Account ID, name, status, portal access, contact, phone). Until emails are added, opening the portal reaches 19 customers.
2. **The new portal is closed, and stays closed until you open it.** "Portal open to customers" is OFF. While it is OFF no real customer can log in, set a password, get a link or be invited. I checked that on real rows: a real customer's email gets no link, no email and no login. Only the test customer works.
3. **The new portal runs only where the customer-portal switch is on** (`DATA_SOURCE_CUSTOMER_PORTAL=postgres`), because its logins live in the database. With the switch off (production today, and after a merge) both old portals work exactly as before. With it on, the two old logins are closed and `/customer-portal` redirects to `/portal`. So on the day of the switch, customers have no portal until you turn "Portal open to customers" ON. That is in the runbook now.
4. **A slip I caught late:** the test customer's sample visits first took the next row numbers in the practice database, and that blocked three real visits added to the sheet this afternoon from importing. Test rows now use negative row numbers and can never collide with real rows. The three visits are imported and every table matches the sheets again.

### What was built
**One portal.** `/portal` is the customer portal. `/customer-portal` (every page of it) redirects there. Its code is kept.

**Login with email and password.**
- First time: "First time here? Set your password" → type the email → a link by email, valid 24 hours, usable once → choose a password (at least 8 characters, with a show / hide button).
- "Forgot password?" sends a reset link the same way.
- Passwords are stored as bcrypt hashes. Nobody can read them, staff included. Links are stored only as a fingerprint.
- 5 wrong passwords lock that email for 15 minutes.
- An email on several accounts gets "Which location?" after login, and a "Switch location" button on the home screen.
- The login is kept on the device for 30 days.
- The answer to "send me a link" is the same whether or not the email is a customer, so the form cannot be used to find out who is one.
- Every screen re-checks the account: turn portal access off in Settings, cancel the account, or close the portal, and that customer is out at the next tap, not when the cookie runs out.

**Home screen:** eight big buttons, one tap each (at least 88px tall): Next cleaning (with the day and time window on the button), Past visits, Report a problem (with photos), Ask for extra service (from the Extra Services list), Change a date (pick from the coming cleanings), Billing question, Call or text us, My requests.

**After every request:** a big "Sent ✓ We'll get back to you" screen. The request then shows in My requests as Received, Working on it, or Done.

**English and Español:** one button on every screen switches all words; the choice is remembered on the device.

**Staff side:**
- Requests arrive in Portal Requests exactly as before (same four kinds, same statuses).
- Settings → Customer Portal Access has a new card, "Portal open to customers", OFF, with how many customers could log in. Opening asks first.
- The account page has "Send portal invite" in its menu. It is refused while the portal is closed.
- New portal rows get a random code. The 392 codes that were the Account ID were replaced with random ones in the practice database (never in Sheets).

**Test customer:** "ZZ Test Customer", practice database only, never in Sheets: made-up address and phone, your email, cleanings on Monday and Thursday mornings, three past visits. It is left out of the staff account list, the map list, Settings → Portal, schedules, the Visits list and the subcontractor scores. Outside production its "Set your password" link is shown on screen, for test accounts only.

### Checks
| | |
|---|---|
| Login rules and home data, by script on the practice database | 37 of 37 |
| The whole portal clicked through in a headless browser, 375px and 1280px | 104 of 104 |
| Old portals with the switch off | 9 of 9 |
| Earlier areas' save checks, re-run | all pass |
| Every table against the live sheets | all match |
| `tsc`, lint (16 problems, the old count), build | pass, run separately |

The click-through covered: the old addresses redirecting, a wrong password, the show-password button, an unknown email getting no link, the first-time link, a short password refused, the link working once, the home screen, Español on home and forms, each of the eight buttons, all four requests ending on "Sent ✓", My requests, staff seeing the requests and changing a status, the customer seeing "Working on it", log out, log in with the password, and the 30-day cookie. Every screen measured: no sideways scroll, nothing cut off, every button at least 48px, no text under 16px.

Not tested:
- **On a real phone.** Everything was a headless desktop browser at phone width. Your phone test below is the first real one.
- **A real email arriving.** Emails were dry-run; I checked that one would be sent, to whom, and that none went to a real customer.
- **Photos in "Report a problem".** The photo picker is there; no photo was attached (the upload is dry-run here).
- **"Which location?" with two real accounts.** No email is on more than one account today, and there is one test account. The picker's rules passed by script; the screen was not shown with two locations.
- **The portal open.** I never turned "Portal open to customers" on, so real customers logging in was not exercised at all.
- **The staff "Send portal invite" button on the account page.** Its server side was tested (refused for a real account while closed; link returned for the test account); the menu item was not clicked.
- **The lock message on screen.** The 15-minute lock passed by script; I did not type five wrong passwords in the browser.

### Found while doing this (worth your attention)
1. The email numbers above.
2. **Anyone can add a cleaning schedule to any account without logging in.** `/api/portal/schedule-visit` takes an account and a subcontractor email and saves a schedule; it checks no login. The sub portal's "Schedule Visit" uses it. It is live today. I did not change it (the sub portal depends on it). (Proposal 1.)
3. "Past visits" shows the cleanings a crew logged and manager quality checks. Crews have logged one visit in total so far, so for most customers this list will be nearly empty.
4. The next cleaning shown can be today's, even late in the day (it does not know whether the crew has been yet).
5. The first thing your earlier fix on `main` touched (`app/api/customer-portal/route.ts`) is also changed on this branch. When the branch is merged, Git will ask which version to keep in that one file; the branch's version already contains the fix.

### Questions for you
1. How do you want to collect the missing emails: ask managers, or let customers without one keep a phone login for a while?
2. Should "Past visits" also list the scheduled cleanings that have passed (so it is not empty), marked as "scheduled", or only what was actually logged?
3. "Call or text us" uses the account manager's phone. Is there one office number you would rather show?

### Decisions made without you
1. **The new portal is tied to the customer-portal switch**, so nothing changes for customers until you switch. Undo: `newPortalOn()` in `lib/portalSession.ts`.
2. **While closed, only test accounts work**, including links and invites. On-screen links are for test accounts only, never for a real customer, even on a preview.
3. **Who may log in:** the email is on an account that is not cancelled and has portal access ON in Settings → Portal. So Settings → Portal still decides who gets in.
4. **Portal codes are no longer a way in.** They were randomized as you asked and remain as a reference in Settings → Portal.
5. **Test rows are hidden from staff lists by leaving the test account out of the lists** (accounts, map, schedules, visits, scores), not by a filter on each screen.
6. Statuses in plain words: New → Received; In Progress or anything else open → Working on it; Resolved or Closed → Done. Staff notes are never shown to the customer.
7. The four old form pages and the old dashboard redirect to the new screens where the new portal runs.
8. "Ask for extra service" lets the customer tick several services; they arrive as one request.
9. Photos: at most 6 per report.

### Protected files edited
None.

### How to undo
Revert the three commits whose message starts with `portal:`. The database pieces (`db/migrations/017_portal_login.sql`) only add tables and two columns; with the code reverted nothing reads them.
