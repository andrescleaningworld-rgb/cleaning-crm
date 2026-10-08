# Production cutover runbook

Written 2026-10-08 at the end of the migration work on branch `migration/postgres`.

**Nothing in this file has been done.** Production still reads and writes Google Sheets and Apps Script. No `DATA_SOURCE_*` switch is on anywhere. The branch is not merged. Every step below is for Andres (or a session he starts for that purpose); the migration sessions never touched `main`, production, or the production database.

**None of these steps has been rehearsed against production.** Each was run many times against the practice database (`migration-dev`). The first real run is the rehearsal in Part 2.

---

## Part 1. What exists

- **16 migration files** in `db/migrations/` (`001` to `016`). They only create new tables, plus foreign keys between those new tables. They do not change or drop any table that production already has (Team Hub, vehicles, logins, the staff activity log).
- **13 import scripts** in `scripts/migrate/` (`import-<area>`), each with a `verify-<area>` that compares every row with Sheets. Re-running an import is safe: it updates rows by key and never deletes.
- **13 switches**, one per area: `DATA_SOURCE_CATALOGS`, `PEOPLE`, `SUBS`, `ACCOUNTS`, `EQUIPMENT`, `SCHEDULING`, `VISITS`, `COMPLAINTS`, `TODOS`, `SALES`, `CUSTOMER_PORTAL`, `SUPPLIES`, `SUB_PORTAL`. Value `postgres` turns an area on. Anything else, or not set, means Sheets. A change takes effect on the next deploy.
- **The new look** (all screens) is in the same branch and does not depend on any switch.
- The data model: `docs/DATA_MODEL.md`. What each area found and decided: `docs/migration-reports/checkpoint-*.md`.

## Part 2. Before any switch: merge and rehearse

1. **Read the checkpoint reports**, at least the "Read this first", "Found while doing this" and "Decisions made without you" parts. Several decisions change small behaviors; each says how to undo it.
2. **Decide the open questions that block a clean import.** There are 137 open questions in `migration_issues` on the practice database (accounts 24, customer portal 25, people 1, sales 1, scheduling 27, subs 17, to-dos 3, visits 39). None blocks the cutover: every questioned row is imported and works as text; it is only not linked. Answers go in with `node scripts/migrate/set-override.mjs` and take effect on the next import.
3. **Check where preview deployments point.** A Vercel preview must use the practice database, not production. In Vercel → Settings → Environment Variables, the Preview value of `DATABASE_URL` must be the `migration-dev` URL. (This was an open issue from the start and was never confirmed.)
4. **Open a preview of `migration/postgres` with no switch set.** It shows today's data from Sheets in the new look. Do the "Click-through test on your phone" from each report. This tests the redesign alone.
5. **Open a second preview with all 13 switches set to `postgres`** (Preview scope only) plus `OUTBOUND_DRY_RUN=1`. It runs entirely on the practice database and sends no email or text. Click through again, and this time save things: the practice database is yours to change.
   - Log in as one real subcontractor here and on the live site side by side (Area 13 report: this is the one answer that could not be checked by script).
   - Log in to the customer portal with one real customer's phone and code.
6. **Merge** `migration/postgres` into `main` only when step 4 looks right. With no switch set, the merge changes the look and the small fixes listed in the reports, and nothing about where data lives.

## Part 3. The switch itself

### Why not one area at a time

The plan allowed switching area by area. After doing all of them, I advise against that for the core areas. Many screens read accounts while they work (the performance score, to-dos, complaints, visits, the customer portal). An area that is still on Sheets reads the Accounts **tab**; once Accounts is on Postgres that tab stops changing, so those screens would quietly show old accounts. The safe shapes are:

- **Stage 1 (optional, low risk, any day):** `CATALOGS`, `PEOPLE`, `EQUIPMENT`. They depend on nothing else. Good as a first real run.
- **Stage 2 (one window, all together):** `SUBS`, `ACCOUNTS`, `SCHEDULING`, `VISITS`, `COMPLAINTS`, `TODOS`, `SALES`, `CUSTOMER_PORTAL`, `SUPPLIES`, `SUB_PORTAL`.

### What a window needs

Pick a time when nobody is working (the imports take a few minutes; allow an hour). Tell staff and subs not to save anything in the app during it.

For the areas in the window:

1. **Let the scripts reach production.** They refuse any database except `migration-dev` (`scripts/migrate/lib/guard.mjs`, an allow-list). Reaching production needs a deliberate, one-line change: add the production endpoint id to `ALLOWED_ENDPOINTS`, in its own commit, and set `MIGRATION_DATABASE_URL` to the production URL on the machine that runs the scripts. Take that line out again afterwards. *I have not done this and could not test it.*
2. **Back up first.** In Neon, create a branch of production named for the date. That is the undo for the database.
3. **Create the tables:** `node scripts/migrate/apply.mjs`. It applies `001`–`016` in order and records them; running it twice does nothing.
4. **Carry the answers over.** The practice database has 6 overrides (5 managers tied to their Staff record, 1 manager name on accounts). Re-enter them on production with `set-override.mjs` before importing, or the links come out empty.
5. **Import, in this order** (later ones look up accounts and subs):
   `catalogs`, `people`, `subs`, `accounts`, `equipment`, `scheduling`, `visits`, `complaints`, `todos`, `sales`, `customer-portal`, `supplies`, `sub-portal`.
   Each one first with `--dry-run`, then for real: `node scripts/migrate/import-<area>.mjs` (accounts is `npx tsx scripts/migrate/import-accounts.mts`).
6. **Verify each:** `node scripts/migrate/verify-<area>.mjs`. Every table must say `OK` with 0 missing, 0 extra, 0 field mismatches. If one does not, stop: do not switch that window.
7. **Set the switches** for the window in Vercel (Production scope) and **redeploy**.
8. **Click through** the main screens on production: open an account, add a visit, add and close a to-do, open the sub portal, open the customer portal.
9. **Add the last foreign keys** once `PEOPLE` is on: `manager_accounts`, `equipment_staff_pins` and `vehicles` → `staff`. They were left out on purpose (a new staff member saved in Sheets would have been blocked). This needs a small new migration file; it is not written yet.

### If something is wrong

- **Before step 7:** nothing has changed for anyone. Stop and look.
- **After step 7:** unset the switches and redeploy; the app reads Sheets again within a minute. **Anything saved while the switches were on is in Postgres only and will not be in Sheets.** There is no script that writes back to Sheets (by rule, nothing in this work writes to Sheets). So decide quickly: the longer the switches stay on, the more would have to be re-typed after a rollback.
- The database undo is the Neon branch from step 2. The new tables can also simply be left in place; with the switches off nothing reads them.

### The customer portal on the day of the switch (added with the portal redesign)

The new customer portal (email and password, at `/portal`) starts working the moment `DATA_SOURCE_CUSTOMER_PORTAL` is on, and at that same moment both old logins stop: the phone + code login is closed and `/customer-portal` redirects to `/portal`. But the new portal is **closed to customers** until "Portal open to customers" is turned ON in Settings → Customer Portal Access. So:

1. Before Stage 2, decide the email question: only customers with an email on their account can log in (19 of 311 on 2026-10-08; the list of the rest is in `docs/migration-reports/private/accounts-without-email.csv` on Andres' computer).
2. Migration `017_portal_login.sql` is part of `apply.mjs` like the others. Run `node scripts/migrate/randomize-portal-codes.mjs` once after the customer-portal import (it needs the same guard change as the imports).
3. Do **not** run `create-test-customer.mts` on production unless you want a test customer there. If you do, it is hidden from every staff list.
4. Right after the switches are on, turn "Portal open to customers" ON, or customers have no portal.
5. Then send invites one by one from the account page ("Send portal invite"), or tell customers to use "First time here? Set your password".
6. `PORTAL_SESSION_PASSWORD` must be set for the Production scope (the old portal already needs it).

## Part 4. What stays on Apps Script and Sheets after the cutover

These were not moved. They keep working as today and their tabs stay live:

| What | Tab(s) | Why not moved |
|---|---|---|
| Account Updates (history notes, with its email) | MAIN / Account Updates | Apps Script source is not in the repo; it sends email |
| Sub Transfer Proposals (create, email, approve) | MAIN / Sub Transfer Proposals | Same |
| New Account packet email | – | Same |
| Photos (upload to Drive, list) | MAIN / Photos | Apps Script owns the Drive folders |
| Older customer portal: requests, complaints, history | (inside Apps Script) | Needs a real customer to read; source not in the repo |
| `/api/subcontractor-issues` | – | No screen calls it |

A copy of Account Updates (193 rows), Sub Transfer Proposals (72) and Photos (3) is in Postgres for the day they move; the app does not read those copies.

So `GOOGLE_SCRIPT_URL` and the Google service account stay configured in production after the cutover.

## Part 5. Sheets tabs that become frozen archives

Once a tab's switch is on, the app no longer reads or writes it. **Do not delete or rename anything.** Leave the sheets as they are; they are the record of how things stood, and the only fallback if a switch is turned off.

| After this switch | These tabs are no longer used by the app |
|---|---|
| CATALOGS | PORTAL: ChangeLog, ExtraServices. MAIN: GeocodeCache, Documents, DocumentSends |
| PEOPLE | MAIN: Staff, Managers |
| EQUIPMENT | MAIN: EquipmentCategories, Equipment, EquipmentCheckouts, EquipmentParts, EquipmentRepairs |
| SUBS | MAIN: Subcontractors |
| SUBS + SUB_PORTAL | MAIN: Subcontractor Activity Log |
| ACCOUNTS | MAIN: Accounts, OnboardingChecklist |
| SCHEDULING | MAIN: SubSchedules, ScheduleExceptions. PORTAL: subcontractor-visits |
| VISITS | MAIN: Visits, VisitEditLog |
| COMPLAINTS | MAIN: Complaints |
| TODOS | MAIN: To Do, SmsLog |
| SALES | MAIN: Sales & Commissions |
| CUSTOMER_PORTAL | PORTAL: customer-portal, portal-complaints, portal-service-requests, portal-date-changes |
| SUPPLIES | MAIN: Supplies, Supply Orders |
| SUB_PORTAL | MAIN: Sub Portal Issues |

Tabs the app never read (not imported, not touched): `Settings`, `Drew & Ryan`, `CancelledAccounts`, `CANCELLED ACCOUNTS AUTOMATIC`, `AcceptedNever Started`, `Sum CW`, `Sum Sub`, `Email Log`, `SubSchedules_backup_2026-07-16-03-17-44`. If any of them is a report you look at by hand and it is fed by formulas from a frozen tab, it will stop updating after the cutover. Check `Sum CW`, `Sum Sub` and the two cancelled-account tabs for that before Stage 2.

## Part 6. Things to settle that are not about the cutover

These are live today, on Sheets, and the cutover neither fixes nor worsens them. They are in the reports with details:

- The subcontractor portal logs in with an email alone (Area 13).
- The older customer portal logs in with a phone alone, and portal codes equal the Account ID (Area 11).
- 30 customers cannot log in to `/portal` because their phone is shared with another row (Area 11).
- "Save changes" on a complaint creates a second complaint and re-sends the notifications (Area 8).
- The customer portal's visit calendar is always empty (Area 7).
- The To-Do page makes about a thousand small requests per load (Area 9).
