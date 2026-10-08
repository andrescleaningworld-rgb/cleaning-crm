## Checkpoint Area 13 (Sub portal) – 2026-10-08

Time: about 0.7 h actual vs 28 h estimate. Total so far: about 10.2 h vs 237 h estimated (areas 0, B, 1 through 13).

**New estimate.** 19 hours are still on the plan (Shell/rest and Wrap-up); at the measured pace that is about **1 to 3 hours of Claude Code work**. Deadline: not set.

### Read this first
1. **The sub portal has no password.** A subcontractor logs in by typing an email. Anyone who knows (or guesses) a sub's email sees that sub's accounts, addresses, key and alarm notes, sub pay and complaints. This is how it works today on the live site; I did not change it. (Question 1.)
2. **One part of this area could not be checked against the live system:** what a sub sees right after logging in. Checking it means logging in as a real subcontractor, which I do not do. It is built from three lists that were each proven identical to the live system in earlier areas, and tested with a made-up subcontractor. **Before turning this switch on, log in as a real sub on a preview and compare the screen with the live portal** (steps at the bottom).

### What changed (plain words)
- The issues subs report (1 row) and the photo list (3 rows) are now also in the practice database.
- With the switch `DATA_SOURCE_SUB_PORTAL` on, the sub portal (login, accounts, complaints, report an issue, order supplies, activity log) and the staff **Notifications** screen work from the database, and Apps Script is not called for them. The switch is **not set**, so the live app works as before.
- The sub portal and Notifications have the kit look: bigger text everywhere, kit buttons, boxes and fields. Layout and features are the same.
- An order a sub sends from the portal now lands in the same place as Area 12's supply orders when the switch is on.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| sub_portal_issues (Sub Portal Issues) | 1 | 1 | ✓ |
| photos (Photos) | 3 | 3 | ✓ |

Every row compared field by field: 0 missing, 0 extra, 0 different. The issue list rebuilt from the database is identical to the live Apps Script answer, and `/api/notifications` is byte-identical on both sources.

Tested on Postgres: 22 function checks (the rules of the login answer on real rows, printing counts only; activity lines; issues; status changes), then every action over the web and through the screens as **one made-up subcontractor** with two made-up accounts and one made-up complaint: unknown email refused, login, all six tabs, an activity line, an issue, a supply order, "Mark Resolved by Sub", logout. Emails were dry-run. Everything made up was removed.

What the test confirmed about privacy:
- A sub gets only the accounts tied to that sub. Revenue and margin are still removed before anything is sent; sub pay is shown.
- Who the sub is always comes from the login session. A page that sends someone else's email in the request is ignored.

Not tested:
- **The login answer against a live login** (see "Read this first").
- **Any real sub's login**, on either source.
- **A photo upload** from "Report an issue" (it goes to Apps Script and Google Drive).
- **Schedule Visit** in the portal (it saves a schedule; the function was tested in Area 6).

### Found while doing this (worth your attention)
1. The login item above.
2. **Photos a sub attaches to an issue are filed under an id no issue has.** The server drops the new issue's id from its answer, so the page invents one. That is why the Photos tab only has complaint photos and the one issue shows no photo count. On Postgres the id is passed back. (Fixed on the Postgres side only.)
3. **One email is on two subcontractor rows** (the Leo case from Area 3): that email always logs in as the first row.
4. **2 subcontractors have no email**, so they cannot log in at all.
5. **75 cancelled accounts are still tied to a subcontractor.** I do not know whether the live portal shows them to the sub. On Postgres they are hidden. (Question 2.)
6. The activity log gets "Login" from the page, not from the server, so a login is only logged if the page finishes loading.

### Questions for you
1. Should the sub portal ask for more than an email (a code, or a link sent to the email)?
2. Should a sub see their cancelled accounts? (Today on Postgres: no.)
3. When a sub reports an issue, does anyone get an email today? On Postgres the office does (info@ and crm@).

### Feature checklist
| Screen | Before | Now |
|---|---|---|
| Sub portal login | Banner, email box, Access Portal, messages | Same |
| Sub portal, logged in | "Logged in as" card with counts, Logout, six tabs (My Accounts, Complaints with a count, Report Issue, Supply Order, My Schedule, My Calendar) | Same |
| My Accounts | Count, sort, account cards, selected account details (address link, service, frequency, schedule, health, sub pay, key, alarm, scope), Report Issue / Order Supplies for this account, visit calendar, schedule next visit, checklists | Same |
| Complaints | Open complaints, resolution note, Mark Resolved by Sub | Same |
| Report Issue | Account, type, urgency, description, photos, Submit | Same |
| Supply Order | Account, items (with Other), delivery, notes, Submit | Same |
| My Schedule, My Calendar | As built in Area 6 | Same, kit text sizes |
| Notifications (staff) | Title, list of issues with status, Mark Reviewed | Same |

Measured in a headless browser at 375px and 1280px (login, each of the six tabs, Notifications): no sideways scroll, nothing cut off, every button and box at least 48px, no text under 16px. 35 of 35 checks passed. Screenshots are not committed.

### Proposals awaiting approval (nothing here is built)
1. A real login for subs (question 1).
2. Rearrange the sub portal around one main action per tab, with sheets for "Report issue" and "Order supplies". Today it is restyled in place: it is one very long page.
3. Give the two subs with no email a way in; settle the shared email.
4. Still waiting from earlier reports (customer login items, complaint Edit fix, stock columns, and the rest).

### Decisions made without you
1. **The login answer is built from the already-proven lists and was not compared with a live login.**
2. **Photos stay on Apps Script** (upload and list); the 3 rows were copied for the record. Apps Script owns the Drive folders.
3. **Cancelled accounts are hidden from a sub on Postgres.**
4. **A new issue also emails the office on Postgres.**
5. "Mark Resolved by Sub" on Postgres sets the status and keeps the sub's note with the complaint, the same way a staff close does.
6. The sub portal page was restyled in place, not rearranged. The word pills (counts, time windows) keep their colors, with 16px text.
7. `/api/subcontractor-issues` was left alone: no screen calls it.

### Protected files edited
- `app/subcontractor-portal/page.tsx`: class names only (kit classes, text sizes). No logic changed.

### Still on Apps Script after this area
Account Updates, Sub Transfer Proposals, the New Account packet email, Photos (upload and list), the older customer portal's requests / complaints / history, and the unused `/api/subcontractor-issues`. Everything else has a Postgres path behind its switch. These are listed for the wrap-up.

### Click-through test on your phone
On a Vercel preview of this branch (switch off, so it shows today's data in the new look):
1. Open the **sub portal** and log in as a test subcontractor. Tap each of the six tabs: text is larger, nothing is cut off.
2. Open **Notifications**: the issue list and "Mark Reviewed" are there.

Before turning the switch on (preview with `DATA_SOURCE_SUB_PORTAL=postgres` and the earlier switches on):
3. Log in as one real sub on the preview and on the live site side by side. The accounts, the complaints and the sub pay should be the same (cancelled accounts aside).

### How to undo
Data: leave `DATA_SOURCE_SUB_PORTAL` unset (it is). Screens: revert "migration(sub-portal): step 5 …". Everything: revert the commits whose message starts with `migration(sub-portal)`.
