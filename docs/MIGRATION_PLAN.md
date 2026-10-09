# Migration + Redesign Plan: Google Sheets → Postgres, "simple enough for a 5-year-old"

Condensed version, 2026-10-07 (original written 2026-10-01). **This file is the single source of truth.** Every session: read AUTO MODE RULES, then go to PROGRESS at the bottom and continue from "Next step". Never redo anything marked done.

**THE GOAL: every screen must be simple enough for a 5-year-old child to use.** That applies to everyone: owner, managers, office staff, subs, customers, and crews. If a screen needs explaining, it isn't done. When in doubt, make it bigger, use fewer words, and show one obvious next step. Part B has the rules.

---

## AUTO MODE RULES (read first, every session)

> **Changed by Andres on 2026-10-07 (full auto, no checkpoints).** Rules 5, 10 and 11 below were rewritten and rule 15 was added. Wherever the rest of this file says "stop", "ask Andres", "needs approval at a checkpoint" or "CHECKPOINT", apply rules 5, 10, 11 and 15 instead. Rules 1–4, 6–9 and 12–14 are unchanged.

1. **Branch.** Work only on `migration/postgres`. Commit and push to that branch only. Never commit/push to `main`, never merge, never open a PR unless Andres asks, never deploy to production (no `vercel deploy --prod`, promote, or alias changes).
2. **Database.** Use only the Neon **dev branch**, stored as `MIGRATION_DATABASE_URL` in `.env.development.local`. Never the production DB. Every script that connects to Postgres calls `scripts/migrate/lib/guard.mjs`, which refuses to run if the host is the production host.
3. **Google Sheets are read-only.** Never write, rename, or delete anything in Sheets. Import/verify scripts use the `spreadsheets.readonly` scope only. When running the app locally with an area on `sheets`, never click a save button (local dev uses the live sheets). Browsing is fine.
4. **No real messages from testing.** Every local test runs with `OUTBOUND_DRY_RUN=1` (SMS/Textbelt, email/Resend/Gmail, push/OneSignal, Google Calendar, Apps Script writes). If unsure whether an action reaches the outside world, don't run it.
5. **Protected files.** Andres approved editing these on the `migration/postgres` branch only, for this whole migration (2026-10-07). They are still the riskiest files: change them only when an area needs it, keep every feature working, and list each edit in the area report:
   - `app/visits/page.tsx`, `app/visits/[id]/page.tsx`
   - `app/subcontractor-portal/page.tsx`
   - Staff login: `app/login/page.tsx`, `app/api/login/**`, `app/api/logout/route.ts`, `lib/adminSession.ts`, `lib/managerAccounts.ts`, `proxy.ts`
   - If a file might be protected, treat it as protected: same care, and list it in the report.
6. **Checks.** Three separate commands, never chained:
   - `npx tsc --noEmit`
   - `npm run lint`
   - `NODE_OPTIONS="--max-old-space-size=4096" CIRCLE_NODE_TOTAL=3 npm run build`
   All three must pass before any commit touching app code (pre-existing lint errors in `scripts/` don't count; new ones do). Scripts/docs-only commits need tsc only.
7. **Commit after every completed step**: `migration(<area>): step N – <what>`. One step per commit.
8. **PROGRESS.** After every step, update PROGRESS (done, next step, open issues, start/end time) in the same commit.
9. **Time tracking.** Run `date -Iseconds` at the start and end of every step and log both. After each area, total hours, compare to estimate, update remaining estimate and projected finish.
10. **Checkpoints do not stop.** At each checkpoint write the report (template in C.1) to `docs/migration-reports/`, commit, push the branch, and keep going to the next area.
11. **Blocked = log, skip, continue.** If a write or command is blocked by a permission or classifier, never retry it smaller, reworded, or another way. Log it under "Blocked and skipped" in PROGRESS, skip that task, and continue with the next one that can be done.
12. **Keep features working.** The redesign changes visuals and layout only. Every feature, field, and permission keeps working. Behavior changes, removed features, or renames (e.g. "Complaints" → "Problems") need approval; list them under "Proposals awaiting approval".
13. **Never merge the two activity logs** (Sub Center log vs Settings → Activity Log). Never change owner-only gating on `/settings/activity-log`.
14. **Never delete Team Hub** code or tables. Hidden, not removed.
15. **Questions for Andres are not asked.** For every open question (Leo, Giovanna/Cesar, which portal is live, CUSTVISITS, and anything new): make the safest choice, never auto-merge or delete data, write the decision in "Decisions made without Andres" in PROGRESS (what, why, how to change it), and keep going. Rule 12 proposals (behavior changes, removed features, renames) are still not built: list them in the area report and keep the current behavior.

---

## PART A – Inventory (summary; Step 0 of each area confirms the real headers)

### A.1 Data sources
- **MAIN sheet** (`GOOGLE_MAIN_SHEET_ID`): Accounts and most staff-side data.
- **PORTAL sheet** (`GOOGLE_SHEET_ID`): customer portal tabs, ExtraServices, subcontractor-visits.
- **CUSTVISITS sheet** (hard-coded id in `lib/googleSheets.ts`): one `Visits` tab, probably legacy. Confirm.
- **Apps Script** (`GOOGLE_SCRIPT_URL`, `lib/appsScriptFetch.ts`, cache `lib/serverCache.ts`): legacy backend; **source not in repo**.
- **Postgres** (Neon, `@neondatabase/serverless`, `lib/db.ts` → `getSql()`, `DATABASE_URL`). No ORM. Tables made by idempotent `scripts/setup-*-db.js`. `.env.local` points at **production**, hence rule 2.
- Sheets auth: service account (`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`), 60s in-memory cache.

### A.2 Tabs (D = direct Sheets API, AS = Apps Script)
**MAIN**
- **Accounts** (A:AI, header-matched writes). Includes secrets: Key/Alarm/Access (G), Monthly Revenue (H), Monthly Sub Pay (K). Subcontractor (I) is free text; Manager (J) is a name. D reads + `updateAccountFieldsDirect`, `setAccountChecklistNeeded`. AS: `getAccounts`/`getAllAccounts`/`getMapAccounts`, `addAccount`, `updateAccount`, `updateAccountFields`, `sendNewAccountPacket` (email).
- **Subcontractors** (A:Z). Column A is an ARRAYFORMULA `SUB-0NN` (never write). App id is `SUB-ROW-<row>` (row position!). D: `getAllSubcontractorsRaw`, `updateSubcontractor`, performance map. AS: `addSubcontractor`, `getSubcontractors`, sub-portal login.
- **Managers** (A:G, `MGR-…`): not a login source. **Staff** (A:D, `STF-…`, Role, Active): the login identity source (`manager_accounts.staff_id`).
- **To Do** (A:P, `TODO-…`, D only). Known shifted rows from an old append bug. **SmsLog** (A:G).
- **OnboardingChecklist** (A:G, ItemsJson).
- **SubSchedules** (A:P, SubID = sub email, versioned: edits supersede). **ScheduleExceptions** (A:I).
- **Visits** (manager visits, A:M). AccountID uses a different scheme; join by name. AS `getVisits`/`addVisit`; D by-id read/update. **VisitEditLog** (A:E).
- **Complaints** (A:P, `COMP-…`). D create + scoring. AS get/close/edit/resend (email/SMS)/resolve.
- **Documents**, **DocumentSends** (SubcontractorID = `SUB-ROW-n`). **GeocodeCache**. **ChangeLog** (confirm which sheet). **Subcontractor Activity Log** (AS write).
- **Sales & Commissions** (A:T; Q legacy amount, R dead column).
- **Equipment**: EquipmentCategories, Equipment, EquipmentCheckouts, EquipmentRepairs, EquipmentParts (all D).
- **AS-only (names inferred):** Account Updates, Sub Transfer Proposals, Sub Portal Issues, Supplies, Supply Orders (sends email), Photos, sub-portal session/login, customer-portal (AS version).

**PORTAL**: customer-portal (joined to Accounts by lowercase name; Account ID often blank), portal-complaints, portal-service-requests, portal-date-changes, portal-billing-requests (no row IDs), ExtraServices, subcontractor-visits.

### A.3 Existing Postgres tables
Crew Link (`checklist_templates`, `checklist_tabs`, `checklist_submissions`, `content_translations`), supplies (`supply_items`, `supply_orders`, `supply_order_lines`), Equipment Check (`equipment_check_link`, `equipment_staff_pins`, `equipment_reports`), Vehicles (`vehicles`, `vehicle_service_items`, `vehicle_service_logs`, `vehicle_mileage_readings`, `vehicle_digest_sent`), logins/audit (`manager_accounts`, `activity_log`), Team Hub `hub_*` (hidden). None have FKs to Sheets data.

### A.4 Known identity problems (ask Andres, never auto-fix)
1. "Giovanna" matches both G & G Magic Touch and D&A (Alonso & Giovanna Mendoza); same class: "Cesar" vs "Cesar Decarvalho".
2. Duplicate Leo: SUB-004 and SUB-037.
3. Sub IDs are row positions; inserting/deleting rows renumbers everyone.
4. Account IDs had duplicates before; Postgres gets UNIQUE, import reports dupes.
5. Name-based joins everywhere (To Do, Visits, Complaints scoring, portal, Sales).

**Import handling:** every table keeps the raw Sheets text in `*_raw` next to a resolved `*_id`. If not certain, `*_id` stays NULL and a row goes to `migration_issues` (area, table, legacy key, problem, candidates). Andres's answers go to `migration_overrides` (legacy key → id), which re-runs respect.

---

## PART B – Design system (built after Phase 0, before any area)

Start from the existing "Softer Edges" audit (artifact `f8769387-5d67-4d33-8462-94cf1b5df5b9`).

**Rules for every redesigned screen**
1. One main action per screen: one big filled button (bottom on phone, bottom-right on desktop). Others secondary or in "More".
2. Big: body 18px (min 16), headings 24–28px, tap targets ≥48px (56 for main), ≥8px between tappables.
3. Plain words: verbs on buttons ("Save", "Mark done"), no "Submit", no raw IDs, dates like "Tue, Oct 7". Renames need approval.
4. Always show the result: "Saving…" → green "Saved ✓" toast (3s, aria-live) → visible update. Failures: red plain-words box + "Try again". Nothing fails silently.
5. Phone first: one column under 640px, no sideways scroll, sticky header with back arrow. Cards on phone, tables only on desktop.
6. One search box per list, max 3 filter chips, helpful empty states.
7. Confirm only destructive actions, with the consequence spelled out.
8. Status = color + word + icon (green Done, amber Waiting, red Needs you, gray Off).
9. Crew/sub screens use existing EN/ES/PT strings; components never hard-code English.
10. WCAG AA, visible focus, labeled inputs, works at 200% zoom.

**Build (new files only):** `app/globals.css` tokens (additive), `app/ui/` components (Screen, BigButton, Field, SaveStatus + `useSaveAction()`, Toast, Card, CardList, SearchBar, FilterChips, StatusPill, EmptyState, Skeleton, ConfirmSheet, Stepper, PhotoPicker, PersonPicker/AccountPicker, MoreMenu, Tabs), `app/ui/words.ts` (labels + glossary), `app/design-preview/page.tsx` (staff-only, every component in every state). Done when checks pass, preview checked at 375/768/1280px, keyboard-only pass.

**CHECKPOINT B:** Andres reviews the preview on his phone and approves the look and word list.

---

## PART C – Phases

### C.0 Phase 0 – Shared machinery (each step = one commit)
1. **Branch:** `git checkout -b migration/postgres` from `main`, push with `-u`.
2. **Neon dev branch:** create `migration-dev` from production (copy-on-write). Write its pooled URL to `.env.development.local` as `MIGRATION_DATABASE_URL`, and set `DATABASE_URL` there to the dev URL too. Record the production host in `guard.mjs` as forbidden. If this needs Andres's login, stop and ask.
3. **Guard + harness** in `scripts/migrate/lib/`: `guard.mjs`, `sheets-readonly.mjs`, `pg.mjs`, `report.mjs` (writes `docs/migration-reports/<area>-<date>.md`).
4. **Schema migrations:** `db/migrations/NNN_<name>.sql` + `scripts/migrate/apply.mjs`; `schema_migrations` table; files idempotent and never edited after applying. Shared tables: `migration_runs`, `migration_issues`, `migration_overrides`.
5. **Data-source flags:** `lib/dataSource.ts` → `dataSource(area)` reads `DATA_SOURCE_<AREA>` (default `sheets`). Areas: CATALOGS, PEOPLE, SUBS, ACCOUNTS, EQUIPMENT, SCHEDULING, VISITS, COMPLAINTS, TODOS, SALES, CUSTOMER_PORTAL, SUPPLIES, SUB_PORTAL. `lib/data/<area>.ts` keeps the same function names and return shapes as today, switching between `lib/pg/<area>.ts` and the existing Sheets code. Sheets code stays untouched as the fallback. (Env var changes apply on the next redeploy.)
6. **Outbound dry-run:** `OUTBOUND_DRY_RUN=1` makes `lib/sms.ts`, `lib/email.ts`, `lib/push.ts`, `lib/googleCalendar.ts`, and Apps Script POSTs log "[dry-run] would send …" and return fake success. Default off.
7. **Parity tester:** `scripts/migrate/parity.mjs <area>` runs each read function with `sheets` and `postgres` and deep-diffs the JSON (ignore `sheetRow`).

**CHECKPOINT 0:** branch pushed, dev DB working, guard refuses the prod URL, plus the open questions in C.3.

### C.1 Per-area recipe
- **Step 0 – Discovery (read-only):** dump each tab's real header row and row count to `docs/migration-reports/<area>-headers.md`; note differences from Part A.
- **Step 1 – Schema** (`db/migrations/NNN_<area>.sql`, dev only): PK (keep stable legacy IDs), `legacy_key TEXT UNIQUE NOT NULL` (ID or SHA-256 of identifying columns), `source_sheet`, `source_row`, `imported_at`, `created_at`, `updated_at`. Real types (`date`, `timestamptz`, `numeric(12,2)`, `boolean`, `jsonb`), CHECKs for known values (unknowns → `migration_issues`). FKs only when both sides are in Postgres; otherwise soft `*_id TEXT` + later "tighten" migration. Secrets returned only to the same callers as today.
- **Step 2 – Import** (`scripts/migrate/import-<area>.mjs`): read-only Sheets, `INSERT … ON CONFLICT (legacy_key) DO UPDATE` in a transaction per table. Deleted/blank rows reported, never auto-deleted. Applies overrides, logs issues. `--dry-run` first, always.
- **Step 3 – Verify** (`scripts/migrate/verify-<area>.mjs` → committed report): exact row counts or explained differences; 10 random rows + all known oddities field by field; money sums, status counts, date min/max; `parity.mjs` must match or each difference explained.
- **Step 4 – Switch behind the flag:** `lib/data/<area>.ts` + `lib/pg/<area>.ts`, routes import from `@/lib/data/<area>`. Apps Script writes get a Postgres version **including side effects** (emails/SMS); if unknown, stop and ask. Postgres writes log `activity_log` exactly where Sheets does today. Test locally with `DATA_SOURCE_<AREA>=postgres` and `OUTBOUND_DRY_RUN=1`: every screen, every save, check DB rows, re-run parity. Then flip to `sheets` and confirm reads still work (no saves). Checks, commit.
- **Step 5 – Redesign** the area's screens with Part B. Same features/fields/permissions. One page per commit. Feature checklist per page (every old button/field and where it is now). Screenshots at 375px and 1280px.
- **Step 6 – CHECKPOINT report:**
```
## Checkpoint <area> – <date>
Time: <actual h> vs <estimate h>. Remaining: <h>. Projected finish: <date>. Deadline: <date> – ON TRACK / AT RISK (why).
What changed (plain words):
Data check: <table: sheets N / postgres N ✓> … parity: <n identical, n explained>
Questions for you (data): <migration_issues as plain questions>
Proposals awaiting approval:
Protected files I need next:
Readers still on Sheets/Apps Script:
Click-through test on your phone:
 1. Open … tap … you should see …
How to undo: DATA_SOURCE_<AREA>=sheets + redeploy. Code: git revert <commits>.
```
- **Cutover (Andres only, never in auto mode):** re-run import right before flipping, flip the flag, Sheets stops getting that area's new data. Flipping back is instant, but Postgres-only rows since the flip are listed by `scripts/migrate/changes-since.mjs <area> <timestamp>`. An area flips in production only when nothing else still reads its tabs from Sheets/Apps Script.

### C.2 Areas (fewest dependencies first; ★ = highest impact)
1. **Catalogs & logs (pilot):** ChangeLog, GeocodeCache, ExtraServices, Documents, DocumentSends → `changelog_entries`, `geocode_cache`, `extra_services`, `documents`, `document_sends` (sub id resolved after Area 3). Screens: `app/documents`, `app/settings/extra-services`.
2. **People:** Staff, Managers → `staff`, `managers` (`managers.staff_id` suggested by name, never auto-set). Tighten FKs from `manager_accounts`, `equipment_staff_pins`, `vehicles.driver_staff_id`. Login routes are protected: ask at Checkpoint B or keep login on Sheets. Don't merge Staff and Managers (propose only).
3. **Subcontractors:** Subcontractors, Subcontractor Activity Log → `subcontractors` (new permanent id, default column A `SUB-0NN`; `legacy_row_id` = `SUB-ROW-n`; email unique where present), `sub_name_aliases`, `sub_activity_log`. Decisions needed: Leo, Giovanna/Cesar, duplicate emails. Screens: `app/subcontractors/**`, `app/sub-center/**` (logs stay separate).
4. **★ Accounts (4a + 4b):** Accounts, OnboardingChecklist, Account Updates (AS), Sub Transfer Proposals (AS) → `accounts` (UNIQUE id, `subcontractor_id` + raw, `manager_id` + raw), `onboarding_checklists`, `account_updates`, `sub_transfer_proposals`. Tighten FKs from checklist/hub/supply tables where all values match. Rebuild AS writes: addAccount (match their ID rule), updateAccount, updateAccountFields, sendNewAccountPacket, createSubTransferProposal + email. 4a: `app/accounts/page.tsx` (split into components), `[id]`, edit, new. 4b: account-updates, account-health, accounts-center, map + coverage map. Don't flip production until Areas 11 and 13 are done (or Andres accepts they read the frozen sheet).
5. **Equipment:** 5 equipment tabs → snake_case tables, `holder_staff_id`/`holder_sub_id`. Propose (don't build) a `part_stock_adjustments` table. Screens: `app/equipment/**`, `app/equipment-check/[key]`, `app/subcontractor-portal/equipment`.
6. **Scheduling:** SubSchedules, ScheduleExceptions, subcontractor-visits, CUSTVISITS (archive if dead) → `sub_schedules` (keep versioning), `schedule_exceptions`, `sub_visit_logs`, `customer_visits_archive`. Screens: `app/sub-schedules/**`.
7. **Manager visits (protected; approval at Area 6 checkpoint):** Visits, VisitEditLog → `manager_visits` (account resolved by name, ambiguous → issues), `visit_edit_log`. Rebuild addVisit.
8. **Complaints:** → `complaints` (+ raw/resolved people; `resolved_at_inferred` new column, never overwrite history). Rebuild close/edit/resend/resolve. Score logic identical (`SCORING_ROLLOUT_DATE`), parity-tested.
9. **To-Dos:** To Do, SmsLog → `todos` (shifted rows → issues, no silent fix), `sms_log`. Calendar sync stays one-way. Screen: `app/to-do` (split), bulk modal on accounts list.
10. **Sales & reports:** → `sales` (drop dead R, Q as `legacy_amount`). Screens: `app/sales`, `app/reports` (rewire to `lib/data/*`).
11. **Customer portal:** ask first which is live (`app/(customer)/portal/*` vs `app/customer-portal/*`). → `portal_access`, `portal_requests` (one table with `kind`). Screens: live portal, `app/portal-requests`, `app/settings/portal`.
12. **Supplies:** Supplies + Supply Orders (AS) → merge into existing `supply_items`/`supply_orders`/`supply_order_lines`; rebuild order email. Screens: `app/supplies`, `app/supply-orders` (+ PO PDF), dashboard count.
13. **Sub portal (protected; approval at Area 12 checkpoint):** login, issues, resolveComplaint, activity log, photos → `sub_portal_issues`, `photos`. Screens: `app/subcontractor-portal/page.tsx`, `app/notifications`. Afterwards grep `GOOGLE_SCRIPT_URL` to confirm no Apps Script callers remain.
14. **Shell & rest (redesign only):** dashboard `app/page.tsx`, `CWHeader`, help, settings hub/logs/activity-log (keep owner gating), sub-center shell, crew-link/porter (tokens only), login (protected).
15. **Wrap-up:** final FKs, `docs/DATA_MODEL.md`, production cutover runbook, list of Sheets tabs that become frozen archives. Nothing deleted.

### C.3 Open questions for Andres (not asked; decided per rule 15 and logged in PROGRESS)
1. Paste the Apps Script source (`.gs` files) into `docs/apps-script/`?
2. Leo: keep SUB-004 or SUB-037? Giovanna/Cesar: pick per account from a list.
3. Which customer portal is live: `/portal` or `/customer-portal`?
4. Is the CUSTVISITS sheet still used?
5. Vercel preview deployments of `migration/postgres`: which `DATABASE_URL`? If production, set a Preview-only URL for this branch to the dev branch. Claude won't change Vercel settings.
6. Is "redeploy after env change" (~3 min) fast enough?
7. Does anyone edit the Sheets by hand?
8. Deadline date.

---

## PART E – Time

Rough estimate before any work: ~330 Claude Code hours (range 240–455), 18 checkpoints, ~21h of Andres's review time. **Replace with measured pace after the first area.** Tiers if time is short:
- **Tier 1 – Must:** 0, B, 2 People, 3 Subs, 4 Accounts (if Tier 1 goes first, skip Area 1 and prove the pipeline on Area 2).
- **Tier 2 – Should:** 9 To-Dos, 8 Complaints, 6 Scheduling, 13 Sub portal.
- **Tier 3 – Can wait:** 1, 5, 7, 10, 11, 12, 14, 15.

After each checkpoint: total actual hours (gaps >30 min don't count), update the area table, re-estimate remaining work × (actual ÷ estimate once 2+ areas done), recompute projected finish. If it passes the deadline or slips >1 week, the report's first line is `⚠ DEADLINE AT RISK` with a proposed cut list.

---

## PROGRESS

**Status:** ALL 15 AREAS DONE plus the customer portal redesign, on branch `migration/postgres` (2026-10-08). Production data is unchanged: no `DATA_SOURCE_*` flag is on anywhere, the branch is not merged. One fix went to `main` on Andres' instruction (0b84133, the no-digit phone lookup). 'Portal open to customers' is OFF. Lint baseline: 16 problems (10 errors, 6 warnings).

**Done:**
- Phase 0, step 1: branch `migration/postgres` created from `main` (at `5ecae04`), plan committed as `docs/MIGRATION_PLAN.md`.
- Phase 0, step 2: Andres created Neon branch `migration-dev`; its pooled URL is in `.env.development.local` (git-ignored) as `MIGRATION_DATABASE_URL` and `DATABASE_URL`. Dev host: `ep-small-credit-auvaagcl-pooler.c-10.us-east-1.aws.neon.tech`. Read-only connection test passed.
- Phase 0, step 3: `scripts/migrate/lib/` (`env.mjs`, `guard.mjs`, `pg.mjs`, `sheets-readonly.mjs`, `report.mjs`) + `scripts/migrate/check-harness.mjs`. Guard refuses other Neon endpoints, non-Neon hosts, look-alike hosts, and a missing URL; accepts the dev branch. Sheets part of the self-test fails (no credentials).
- Phase 0, step 4: `db/migrations/001_migration_core.sql` + `scripts/migrate/apply.mjs` (`--status` to list). Dev branch now has `schema_migrations`, `migration_runs`, `migration_issues`, `migration_overrides`. Re-run is a no-op; an edited applied file stops the run.
- Phase 0, step 5: `lib/dataSource.ts` (`dataSource(area)`, `isPostgres(area)`, `allDataSources()`; default `sheets`). `lib/data/<area>.ts` files are created per area in Step 4 of each area.
- Phase 0, step 6: `OUTBOUND_DRY_RUN=1` (`lib/outbound.ts`) covers `lib/sms.ts`, `lib/email.ts`, `lib/push.ts`, `lib/googleCalendar.ts`, `lib/googleDrive.ts`, and Apps Script writes in `lib/appsScriptFetch.ts` (reads named `get…` still go through). Three raw Apps Script `fetch` calls in `app/api/accounts/route.ts` and `app/api/subcontractors/route.ts` now go through `fetchAppsScriptDirect` (same request when dry-run is off). Proof: `npx tsx scripts/migrate/check-dry-run.mts` (17 checks, network trapped). Not covered: direct Google Sheets writes and Vercel Blob uploads.
- Phase 0, step 7: `scripts/migrate/parity.mts <area>` + `scripts/migrate/lib/diff.mjs`; each area lists its reads in `scripts/migrate/parity/<area>.mts`. Self-test: `npx tsx scripts/migrate/parity.mts --self-test`.
- Part B: UI kit in `app/ui/` (`core.tsx`, `controls.tsx`, `toast.tsx`, `words.ts`, `index.ts`), `.ui-*` styles and `--ui-*` tokens appended to `app/globals.css`, preview at `/design-preview`. Checked at 375/768/1280px, keyboard-only pass, 640px (200% zoom). No existing screen uses the kit yet.
- Area 1, step 0: `scripts/migrate/discover.mjs <area>` (headers + counts only, no cell values; `--tabs` lists tabs no area claims) → `docs/migration-reports/catalogs-headers.md`. ChangeLog 3 rows, GeocodeCache 0, ExtraServices 4, Documents 5, DocumentSends 7.
- Area 1, step 1: `db/migrations/002_catalogs.sql` applied to dev (`changelog_entries`, `geocode_cache`, `extra_services`, `documents`, `document_sends`). Dates keep the Sheets text in `*_raw` next to a typed column.
- Area 1, step 2: `scripts/migrate/import-catalogs.mjs` + `lib/import-helpers.mjs`. Dry-run, real run, and re-run all clean: 3 / 0 / 4 / 5 / 7 rows, 0 issues. GeocodeCache is empty in Sheets.
- Area 1, step 3: `scripts/migrate/verify-catalogs.mjs` → `docs/migration-reports/catalogs-verify.md`. All 5 tables match Sheets: every row checked field by field, 0 missing, 0 extra, 0 mismatches. Parity run comes after step 4.
- Area 1, step 4: `lib/pg/catalogs.ts` + `lib/data/catalogs.ts`; 8 routes (changelog, extra-services ×3, documents ×2, geocode ×2) now import from `@/lib/data/catalogs`. `DATA_SOURCE_CATALOGS` unset = Sheets, as before. Tested: parity 11/11 identical (`docs/migration-reports/catalogs-parity.md`); `check-catalogs-writes.mts` 17/17; over HTTP with the flag on `postgres` and dry-run: all reads, create/change/hide a service, send a document (email logged as `[dry-run]`, send row written to Postgres); with the flag on `sheets` the same reads returned byte-identical JSON. Sheets row counts unchanged after the tests. Test rows removed from dev.
- Area 1, step 5a: `app/documents/page.tsx` redesigned with the UI kit (added `Sheet` to the kit). Same features: add (was "Upload"), open, send to sub, send history, delete, category filter; new: search box. Headless click-through 16/16 at 375 and 1280px on Postgres + dry-run; screenshots in `docs/migration-reports/screens/documents-*.png`. Not clicked: a real upload (no Blob token here) and a real delete (would remove a real file).
- Area 1, step 5b: `app/settings/extra-services/page.tsx` redesigned. Same features (add, change, picture upload, sort order, hide / show again). Headless click-through 12/12 at 375 and 1280px on Postgres + dry-run. Not clicked: a real picture upload (no Blob token here).
- Area 2, step 0: `docs/migration-reports/people-headers.md`. Staff 15 rows (ID, Name, Role, Active). Managers 6 rows (A–F as in Part A; G has no header and holds the calendar color). Email and Notes are empty for every manager.
- Area 2, step 1: `db/migrations/003_people.sql` applied to dev (`staff`, `managers`). `managers.row_no` keeps the "sheetRow" number the app saves by; `managers.staff_id` is only set from an override.
- Area 2, step 2: `scripts/migrate/import-people.mjs`. Dry-run, run, re-run clean: staff 15, managers 6. All staff ids used by `manager_accounts` (6), `equipment_staff_pins` (12) and `vehicles.driver_staff_id` (2) exist in Staff. 6 open questions in `migration_issues`: which Staff record each manager is (5 have one same-name match, 1 has none).
- Area 2, step 3: `scripts/migrate/verify-people.mjs` (+ shared `lib/verify-helpers.mjs`) → `docs/migration-reports/people-verify.md`. Both tables match, every row field by field.
- Area 2, step 4: `lib/pg/people.ts` + `lib/data/people.ts`; 18 files switched with the new `scripts/migrate/switch-imports.mjs`. Protected files touched by one import line each: `lib/managerAccounts.ts`, `app/api/login/route.ts`, `app/api/login/setup-password/route.ts`. Parity 9/9; `check-people-writes.mts` 21/21; 7 routes byte-identical over HTTP on both sources; staff create/deactivate/delete over HTTP on Postgres. Not tested: a real password login.
- Area 2, step 5: no screens in this area (Staff screen is `app/equipment/staff`, Area 5; Managers are on `app/settings/page.tsx`, Area 14).
- Area 3, step 0: `docs/migration-reports/subs-headers.md`. Subcontractors 39 rows, 18 columns (A:R, not A:Z). Column A formula is `"SUB-" & (row - 1)`, so SUB-0NN is a row number too, not an id. Extra legacy columns at the far right: a second `ID` (5 rows), a second `Phone` (8 rows), a second `Insurance Expiration`. Activity log 385 rows, 9 action types, Jul 13 – Oct 6 2026.
- Area 3, step 1: `db/migrations/004_subs.sql` applied to dev (`subcontractors`, `sub_name_aliases`, `sub_activity_log`). Permanent `id` + `legacy_row_id` (`SUB-ROW-n`, what the app still uses) + `fingerprint` (contact + company + email) to follow a row that moves.
- Area 3, step 2: `scripts/migrate/import-subs.mjs`. Run + re-run clean: 39 subs (ids SUB-001…SUB-039), 71 unambiguous name aliases, 385 log lines (366 linked to a sub by email), and all 7 Area 1 document sends now resolved to a permanent sub id. 17 open questions in `migration_issues`.
- Area 3, step 3: `scripts/migrate/verify-subs.mjs` → `docs/migration-reports/subs-verify.md`. Both tables match, every row field by field (39 × 18 columns, 385 × 5).
- Area 3, step 4: `lib/pg/subs.ts` + `lib/data/subs.ts`; 6 files switched. With `DATA_SOURCE_SUBS=postgres`: reads, `updateSubcontractor`, a Postgres `addSubcontractor` (replaces the Apps Script action; no email/SMS is known to be sent by it), and the Apps Script `getSubcontractors` list rebuilt from Postgres for the two callers that still used it (notification name → phone/email lookup in `app/api/subcontractors/route.ts`, admin account PDF). Parity 4/4 incl. 39/39 rows identical to the live Apps Script list; `check-subs-writes.mts` 15/15; 5 routes byte-identical over HTTP; add + update over HTTP on Postgres.
- Area 3, step 5a: `app/subcontractors/page.tsx` (list) redesigned. Same features: search, the 4 filters + 14 sorts (now in a "Filter and sort" sheet, with a count of how many are on), add form with all 16 fields, Service Log tab, Open (was View / Edit), Add schedule. Headless click-through 18/19 at 375 and 1280px on Postgres (the 1 miss was the test expecting "2 on" after it had set 3 filters). Screenshots are NOT committed for this page: they show real company names and revenue.
- Area 3, step 5b: `app/subcontractors/[id]/page.tsx` (detail) redesigned. Same content: 3 status pills, 8 number tiles, performance score, 11 detail fields, current and past accounts with totals and links, recent complaints (first 25), Print (same sections printed and hidden as before; tables print instead of cards), Refresh, and the edit form (now a sheet). Headless click-through 17/18 on Postgres (the 1 miss was the test reading the site header instead of the page title). Screenshots not committed (names and money).
- Area 3, step 5c: `app/sub-center/page.tsx` (tab bar now the kit Tabs; `?tab=` and the remembered tab work as before) and `app/sub-center/activity-log.tsx` redesigned (filters in a sheet, cards on phone / table on desktop, first 100 lines with "Show 100 more"). The Sub Center log is still its own thing; nothing was merged with the staff Activity Log. Headless click-through 16/16.
- Area 4a, step 0: `docs/migration-reports/accounts-headers.md`. Accounts 399 rows with data on 842 sheet rows (443 blank rows in between), 35 columns A:AI. Real layout differs from Part A: G = Key / Alarm / Access Info, H = Monthly Revenue, I = Subcontractor, J = Manager, K = Monthly Subcontractor Pay, V/W = Gross Margin, AC/AD = Latitude/Longitude, AE = Has Key, AF = Alarm Code, AG/AH = City/Zip, AI = Checklist Needed; X–AB are empty. OnboardingChecklist 3 rows. Account Updates 193 rows (848 blank; Update ID and Account ID are formulas, filled for only ~20%). Sub Transfer Proposals 72 rows but only 29 distinct Proposal IDs (one proposal = several account rows).
- Area 4a, step 1: `db/migrations/005_accounts.sql` applied to dev (`accounts`, `onboarding_checklists`, `account_updates`, `sub_transfer_proposals`). `accounts.id` is UNIQUE but nullable (one row has no ID); every Sheets column is kept as text, with typed dates, money and coordinates next to it.
- Area 4a, step 2: `scripts/migrate/import-accounts.mts` (run with `npx tsx`; it uses the app own `lib/subAccountMatching.ts`). Run + re-run clean: 399 accounts, 3 checklists, 193 updates, 72 proposal rows (29 proposals). Subcontractor linked on 393 of 396 accounts, using the same rule the screens use. Manager linked on 242 of 396. Updates linked to an account by exact name: 183 of 193; proposal rows: 66 of 72. 25 open questions.
- Area 4a, step 3: `scripts/migrate/verify-accounts.mjs` → `docs/migration-reports/accounts-verify.md`. All 4 tables match Sheets: 399 accounts × 34 columns, 3 checklists, 193 updates, 72 proposal rows, 0 missing / extra / different; revenue sum and proposed-pay sum equal.
- Answers from Andres, 2026-10-08, recorded with `scripts/migrate/set-override.mjs` (nothing changed in Sheets): (2) the Manager text "Andres" = manager `MGR-21-56-24-84z40` → 145 accounts linked, 387 of 396 now have a manager; (4) five managers linked to their Staff records; (3) texting a sub on Postgres now uses the normal Phone column and falls back to the second one: 35 of 39 subs reachable instead of 8. Answer (1), Leo, came with the number left blank ("SUB-___"), so nothing was recorded for it.
- Area 4a, step 4: `db/migrations/006_accounts_unformatted.sql` (the row as cells HOLD it, for Apps Script parity), `lib/pg/accounts.ts`, `lib/data/accounts.ts`; 12 files switched; `app/api/accounts/route.ts` wired. With `DATA_SOURCE_ACCOUNTS=postgres`: all direct reads/writes, the onboarding checklist, the three Apps Script account lists rebuilt from Postgres (`fetchAccountsForAction` is the one switch point for every screen), `addAccount` (ID `ACCT-` + 14 digits), partial saves (`updateAccountFields`) and full-record saves. Checks: parity 11/11 direct reads; `check-accounts-apps-script.mts`: getAccounts 397/397 rows and getMapAccounts 370/370 rows identical to the live Apps Script answers, every field; `check-accounts-writes.mts` 31/31; 5 routes byte-identical over HTTP on both sources; add + partial + direct save over HTTP on Postgres (the "new account assigned" text went to dry-run).
- Safety: `SHEETS_READ_ONLY=1` (set in `.env.development.local` only) makes `getAuthClient` in `lib/googleSheets.ts` ask Google for a read-only token, so Google refuses every Sheets write from this machine (checked: a write with a read-only token gets 403). Unset in production = unchanged.
- Area 4a, step 5a: `app/accounts/new/page.tsx` redesigned. Same 22 inputs in the same 5 sections, same request (`addAccount` with the same 26 fields), same extras (address autocomplete, nearest-sub suggestion, pay suggested at 70% of revenue, portal access row, back to the list after saving). Headless click-through at 375 and 1280px on Postgres: 10 of 13, the 3 misses were wrong expectations in the test (it expected 24 inputs; the old form has 22). Not exercised: Portal access = Yes (it writes to the real portal sheet) and the Google address suggestions (no Maps key here).
- Area 4a, step 5b: `app/accounts/[id]/edit/page.tsx` redesigned. Same 24 inputs in the same 7 sections, 4 number tiles, same save request (`updateAccountFieldsDirect` with only the changed fields plus the always-sent ones), Crew Link switches, pay suggested at 70% while untouched. Headless click-through 14/14 at 375 and 1280px on Postgres; dev database re-imported afterwards and verified.
- Area 4a, step 5c: `app/accounts/[id]/page.tsx` redesigned. Same content and actions: status + health pills, 5 tiles, Account Snapshot (10 facts), Notes, onboarding checklist, checklist editor, History, print packet view; main button Edit account; Add visit / Add complaint / Add update as a row; the other 7 actions in More (Change status, Portal access ON/OFF, Print PDF, Send new account packet, Onboarding checklist, Add sale, Full account info); the three pop-ups are now sheets. Headless click-through 18/18 at 375 and 1280px on Postgres. Not clicked: Portal access (writes to the portal sheet), Send packet and the PDF download.
- Area 4a, step 5d: `app/accounts/page.tsx` (list) redesigned, 3,971 → 3,400 lines: header + More menu (Transfer proposal, Create to-dos for multiple, Print sub account list, Print), one search box with a Search button, all 10 filter/sort controls in a "Filter and sort" sheet, 7 tiles, cards on phone / 6-column table on desktop, Show 15 more, and the three pop-ups (Change status, New to-do, multi to-do) as sheets. Behavior unchanged: loads the default view on arrival, Search/Enter reloads, Clear filters empties the list. Headless click-through 25/25 at 375 and 1280px on Postgres; nothing was saved. The transfer-proposal builder inside the page keeps its old markup in this commit.
- Area 4a step 5e: transfer proposal builder on /accounts redesigned with the UI kit (same handlers; saves still go to Apps Script). Headless check at 375 and 1280px: 38 of 38 pass, nothing saved.
- Area 4a checkpoint report: docs/migration-reports/checkpoint-4a-accounts-2026-10-08.md.
- Area 4b, step 0: discovery. No new tabs: account-updates reads/saves through Apps Script (kept, see 4a decision); account-health is a form with no data source at all; accounts-center, map and the Coverage tab read /api/accounts (already switched) plus /api/geocode (Catalogs, switched). Steps 1–4 have nothing to build; 4b is screen work.
- Area 4b, step 5a: Accounts Center redesigned (tab bar, the three Recent lists, Keys tab, Crew Link queue tab). Same handlers. Headless check at 375 and 1280px passed; nothing saved.
- Area 4b, step 5b: Account Updates list and update page redesigned. Add form and filters open in sheets; same request, same checks, same 5-latest rule; saves still go to Apps Script. Headless check passed at 375 and 1280px (54 checks across 5a and 5b); nothing saved.
- Area 4b, step 5c: Account Health redesigned (tiles, guide, search, log cards, add form in a sheet with the same 11 boxes). The page has no data source: it starts from 3 made-up examples, new items live only until the page is reloaded, and no menu links to it.
- Area 4b, step 5d: Account Map redesigned. Same data, pins, pin limits, auto-location, selection and links; Manager and Sub filters moved into a Filter sheet; the selected account shows as a card under the map instead of floating over it; nearby accounts are cards with a Show on map button.
- Area 4b, step 5e: Sub Center Coverage tab redesigned (By Sub / By Town / Map chips, search that highlights and dims, tag lists) and the coverage map panels restyled (class changes only; the Google map code is untouched). Headless check for 5c–5e at 375 and 1280px: all passed after 2 test fixes; nothing saved. Not tested: the Google map itself (the key does not work on localhost).
- Area 4b checkpoint report: docs/migration-reports/checkpoint-4b-accounts-secondary-2026-10-08.md.
- Area 5, step 0: docs/migration-reports/equipment-headers.md. EquipmentCategories 2 rows, Equipment 1, EquipmentCheckouts 1, EquipmentRepairs 0, EquipmentParts 0. Vehicles, staff PINs and the equipment-check reports are already in Postgres (lib/vehiclesDb.ts, lib/equipmentCheckDb.ts) and are not part of this move.
- Area 5, step 1: db/migrations/007_equipment.sql applied to dev (equipment_categories, equipment, equipment_checkouts, equipment_repairs, equipment_parts). New column sheet_row: the app addresses a checkout by its row number on return, so rows created in Postgres get the next number.
- Area 5, step 2: scripts/migrate/import-equipment.mjs. Dry run, run and re-run clean: 2 categories, 1 item, 1 checkout, 0 repairs, 0 parts, 0 issues.
- Area 5, step 3: scripts/migrate/verify-equipment.mjs → docs/migration-reports/equipment-verify.md. All 5 tables match Sheets, every row field by field.
- Area 5, step 4: lib/pg/equipment.ts + lib/data/equipment.ts; 18 files switched; staffHasEquipmentCheckoutHistory now follows DATA_SOURCE_EQUIPMENT. Parity 13/13 reads identical; check-equipment-writes.mts 40/40; 9 routes byte-identical over HTTP on both sources; add category over HTTP on Postgres. Not exercised over HTTP: checkout, return, repair, photo upload (covered at function level).
- Area 5, step 5: Equipment screens put in the shared page frame (EquipmentShell → app/ui Screen); Check out / Return and Repair pop-ups are now kit sheets; small text in the tablet-report block raised to 16px. Headless measurement at 375 and 1280px on 8 screens + 2 sheets: 50 of 50, nothing saved. The tablet app and the sub portal equipment page were not opened.
- Area 5 checkpoint report: docs/migration-reports/checkpoint-5-equipment-2026-10-08.md.
- Area 6, step 0: docs/migration-reports/scheduling-headers.md. SubSchedules 298 rows / 16 columns (all Active; SubID holds the sub's email; AccountID is the account ID), ScheduleExceptions 0 rows (the code reads 9 columns, the header row has 8: CreatedDate has no header), subcontractor-visits 1 row (PORTAL sheet).
- Area 6, step 1: db/migrations/008_scheduling.sql applied to dev (sub_schedules, schedule_exceptions, subcontractor_visits). The app's own IDs are text, not keys; sheet_row is unique per table because every edit and delete addresses a row by its number.
- Area 6, step 2: scripts/migrate/import-scheduling.mjs. Dry run, run and re-run clean: 298 schedules (298 linked to an account, 271 to a sub), 0 exceptions, 1 sub visit. 27 open questions, all the same one: 27 schedules carry one email that no current subcontractor has.
- Area 6, step 3: scripts/migrate/verify-scheduling.mjs → docs/migration-reports/scheduling-verify.md. All 3 tables match Sheets, every row field by field (298 × 17, 0, 1 × 8).
- Area 6, step 4: lib/pg/scheduling.ts + lib/data/scheduling.ts; 9 files switched. Parity 7/7 reads identical (298 schedules); check-scheduling-writes.mts 25/25 (add, edit, pattern change, supersede, exceptions, sub visits); 3 admin routes byte-identical over HTTP on both sources. Not compared over HTTP: the sub-portal and customer-portal schedule routes (they need a portal login; same functions underneath).
- Area 6, step 5: Sub Schedules redesigned: list page (cards / 9-column table, chips for the three views, main button per view, confirm sheet before removing an exception), Add / Edit / Exception forms as sheets, Full Calendar (filter sheets, month grid on wide screens and a day list on phones, week, agenda), and the shared AutocompleteField restyled for every screen that uses it. Headless click-through 58 of 58 at 375 and 1280px; nothing saved.
- Area 6 checkpoint report: docs/migration-reports/checkpoint-6-scheduling-2026-10-08.md.
- Area 7, step 0: docs/migration-reports/visits-headers.md. Visits 611 rows with data on 1,348 sheet rows (737 blank), 13 columns; column B (Account ID) is a formula (ACC- + row number in hex), column I is an empty duplicate of M. VisitEditLog 6 rows. The visit list and Add visit go through Apps Script (getVisits / addVisit); the Visit page reads and edits the tab directly. Live getVisits answer captured once (read-only) and matched to the sheet: 611 of 611 rows, same order, every field explained.
- Area 7, step 1: db/migrations/009_visits.sql applied to dev (visits, visit_edit_log). The formula Account ID is kept as text and never used as a link; account_ref holds the real account found by exact name.
- Area 7, step 2: scripts/migrate/import-visits.mjs. Dry run, run and re-run clean: 611 visits (553 linked to an account by exact name), 6 edit-log lines. 39 open questions: 36 account names (58 visits) that match no account or more than one, 1 visit without a date, 2 others.
- Area 7, step 3: scripts/migrate/verify-visits.mjs → docs/migration-reports/visits-verify.md. Both tables match Sheets, every row field by field (611 × 14, 6 × 5).
- Area 7, step 4: lib/pg/visits.ts + lib/data/visits.ts; app/api/visits wired (list and add visit on Postgres when DATA_SOURCE_VISITS=postgres), 2 more files switched. The Apps Script visit list rebuilt from Postgres: 611 of 611 rows identical to the live answer, same keys, same order (check-visits-apps-script.mts). Parity 19/19 direct reads; check-visits-writes.mts 23/23; the list route on Postgres is byte-identical to what the route returns for the live answer (268,430 bytes), 3 by-id routes byte-identical on both sources; add + edit + edit history over HTTP on Postgres, test rows removed.
- Area 7, step 5: Visits list, Visit page and Add visit redesigned. List: search, one Filter and sort sheet (7 controls), 3 tiles, cards / 9-column table, 50 at a time with print-all. Visit page: 9 facts, edit form in a sheet, edit history. Add visit: same 9 boxes. Headless click-through 48 of 48 at 375 and 1280px; nothing saved. Protected files edited (standing approval): app/visits/page.tsx and app/visits/[id]/page.tsx, layout only.
- Area 7 checkpoint report: docs/migration-reports/checkpoint-7-visits-2026-10-08.md.
- Area 8, step 0: docs/migration-reports/complaints-headers.md. Complaints 22 rows, 16 columns (Resolution Date, Created At and Last Follow-Up are empty on every row). The list is an Apps Script action (getComplaints), creating a complaint writes the sheet directly, closing and resending go through Apps Script. Live getComplaints answer captured once (read-only): 22 rows in sheet order, 17 fields, 4 of them always blank (complaintType, subcontractor, resolution, followUpDate).
- Area 8, step 1: db/migrations/010_complaints.sql applied to dev (complaints). One column the sheet does not have: resolution_note, so the text typed when closing a complaint is kept.
- Area 8, step 2: scripts/migrate/import-complaints.mjs. Dry run, run and re-run clean: 22 complaints, all 22 linked to an account, 0 open questions.
- Area 8, step 3: scripts/migrate/verify-complaints.mjs → docs/migration-reports/complaints-verify.md. The table matches Sheets, every row field by field (22 × 17).
- Area 8, step 4: lib/pg/complaints.ts + lib/data/complaints.ts; app/api/complaints wired (list, add, close, resend on Postgres when DATA_SOURCE_COMPLAINTS=postgres). The Apps Script complaint list rebuilt from Postgres is byte-identical to the live answer (22 rows; check-complaints-apps-script.mts); the list route on Postgres is byte-identical to what the route returns for it (12,784 bytes). check-complaints-writes.mts 18/18. Over HTTP on Postgres with OUTBOUND_DRY_RUN=1: add (2 emails logged, none sent), close, resend, unknown complaint; test rows and audit lines removed.
- Area 8, step 5: Complaints list, complaint page and Add complaint redesigned (filter sheet, details sheet, close sheet, edit sheet; the Add form keeps the browser's required checks). New .ui-print-view opt-in: Print now prints the content on the complaint page, the Visits list and Account Health (it printed blank pages). Headless click-through 50 of 50 at 375 and 1280px; nothing saved. Lint baseline is now 16 problems (10 errors, 6 warnings).
- Area 8 checkpoint report: docs/migration-reports/checkpoint-8-complaints-2026-10-08.md.
- Area 9, step 0: docs/migration-reports/todos-headers.md. To Do 127 rows, 16 columns (six of them have no header in the sheet: group, outcome, calendar event, sync to calendar, priority); SmsLog 44 rows. Everything already reads and writes the sheet directly (no Apps Script).
- Area 9, step 1: db/migrations/011_todos.sql applied to dev (todos, todo_sms_log). Flags and priority are kept as the sheet text because the app's rules read the text.
- Area 9, step 2: scripts/migrate/import-todos.mjs. Dry run, run and re-run clean: 127 to-dos (124 linked to an account), 44 text-log lines. 3 open questions: 1 account name that matches no account, 2 assignee names that are not in the Managers list.
- Area 9, step 3: scripts/migrate/verify-todos.mjs → docs/migration-reports/todos-verify.md. Both tables match Sheets, every row field by field (127 × 17, 44 × 8).
- Area 9, step 4: lib/pg/todos.ts + lib/data/todos.ts; 4 route files switched. Parity 7/7 reads identical (127 to-dos, the text log, the quota); check-todos-writes.mts 29/29; /api/to-do (55,748 bytes) and /api/to-do/sms-quota byte-identical over HTTP on both sources. Over HTTP on Postgres with OUTBOUND_DRY_RUN=1: add one, add a batch, status, edit, outcome, unknown id; 2 texts, 2 push messages and 3 Calendar changes were logged, none sent; test rows, text-log lines and audit lines removed. Not called: the text status re-check (it asks the text provider).
- Area 9, step 5: To-Do page restyled with the UI kit (title bar, kit buttons / inputs / cards / pills; same structure and handlers), VisitCompletionModal and the shared AccountMultiSelect resized. Headless click-through 30 of 30 at 375 and 1280px (details, edit mode, filters, bulk edit, new-to-do form, print chooser); nothing saved; the per-card text-status requests were answered locally (1,016 of them on one page load).
- Area 9 checkpoint report: docs/migration-reports/checkpoint-9-todos-2026-10-08.md.
- Area 10, step 0: docs/migration-reports/sales-headers.md. Sales & Commissions 2 rows, 20 columns (Q is an old duplicate of Amount Sold, R a dead duplicate of Commission). Reports has no data of its own: it reads accounts, visits, complaints and sales.
- Area 10, step 1: db/migrations/012_sales.sql applied to dev (sales).
- Area 10, step 2: scripts/migrate/import-sales.mjs. Dry run, run and re-run clean: 2 sales, both linked to an account. 1 open question: one sale has no Amount Sold (column H) but has a value in the old Amount column (Q), so the screens that read H show it as 0.
- Area 10, step 3: scripts/migrate/verify-sales.mjs → docs/migration-reports/sales-verify.md. The table matches Sheets, every row field by field (2 × 21).
- Area 10, step 4: lib/pg/sales.ts + lib/data/sales.ts; app/api/sales switched. Parity 1/1; check-sales-writes.mts 8/8; /api/sales byte-identical over HTTP on both sources.
- Area 10, step 5: Sales and Reports restyled with the UI kit in place (scripted class mapping + hand pass; structure and handlers unchanged). Kit fix: children of a screen can no longer be wider than the screen (a wide table was pushing content off the right edge on phones, clipped). The measuring script now also checks for clipped content. Measured at 375 and 1280px: Sales, Reports and To-Do pass; nothing saved.
- Area 10 checkpoint report: docs/migration-reports/checkpoint-10-sales-2026-10-08.md.
- Area 11, step 0: docs/migration-reports/customer-portal-headers.md. customer-portal 393 rows / 19 columns (mostly only Account Name, Phone, Portal Code, Portal Access are filled; Account ID is a formula); portal-complaints, portal-service-requests, portal-date-changes have 0 rows; there is no portal-billing-requests tab, so a billing request from /portal cannot be saved today. Both portals read the same access list: /portal (phone + code, session cookie, saves requests to the portal-* tabs) and /customer-portal (phone only, kept in the browser, requests/complaints/history go to Apps Script).
- Area 11, step 1: db/migrations/013_customer_portal.sql applied to dev (portal_access; portal_requests with the tab name as the kind and three per-kind fields).
- Area 11, step 2: scripts/migrate/import-customer-portal.mjs. Dry-run, run, re-run clean: portal_access 393 (391 linked to an account, 319 with access on), portal_requests 0. 25 open questions: 2 rows not linked, 2 repeated names, 1 repeated code, 19 phones shared by 49 rows with access. The portal code equals the Account ID on 392 of 393 rows. 2 rows have access on and no phone.
- Area 11, step 3: scripts/migrate/verify-customer-portal.mjs → docs/migration-reports/customer-portal-verify.md. portal_access matches, every row field by field (393 × 20); the three request tabs are empty on both sides.
- Area 11, step 4: lib/pg/customer-portal.ts + lib/data/customer-portal.ts; 15 files switched (11 by switch-imports, the 4 request routes now call appendPortalRequest). Parity 13/13 identical (values fingerprinted, none printed); check-customer-portal-writes.mts 24/24; 4 routes byte-identical over HTTP on both sources; on Postgres, end to end with one made-up customer row: login (wrong code refused), dashboard, the four request kinds (emails logged as dry-run), staff list, status change. Not tested: a login on the Sheets source (needs a real customer's phone and code).
- Area 11, step 5: redesigned with the kit: Portal Requests (cards + a detail sheet for status and notes), Settings → Portal (cards on a phone, table when wide, Edit in a sheet), /portal login, dashboard and the four request forms, and the older /customer-portal pages (restyled in place). Headless click-through 84/84 at 375 and 1280px on Postgres + dry-run with one made-up customer row (removed afterwards). Not clicked: a photo upload, a submit on the older portal (goes to Apps Script), Enable/Disable/Generate code on a real row. Screenshots not committed.
- Area 12, step 0: docs/migration-reports/supplies-headers.md. MAIN has a Supplies tab (51 rows, 13 columns) and a Supply Orders tab (13 rows, 14 columns); the app reaches both only through Apps Script. Live read-only answers saved locally for comparison: getSupplyItemsAdmin (51), getSupplyItems (51), getSupplyOrders (13); getSupplies is not an action the script knows.
- Area 12, step 1: db/migrations/014_supplies.sql applied to dev (sub_supplies, sub_supply_orders). Team Hub's supply tables untouched.
- Area 12, step 2: scripts/migrate/import-supplies.mjs. Dry-run, run, re-run clean: 51 supplies, 13 order rows (all 13 linked to a sub and to an account), 0 open questions. 9 of the 13 orders name an item that is not in the catalog today; 5 quantities are text such as '8 boxes'.
- Area 12, step 3: scripts/migrate/verify-supplies.mjs → docs/migration-reports/supplies-verify.md. Both tables match, every row field by field (51 × 14, 13 × 15).
- Area 12, step 4: lib/pg/supplies.ts + lib/data/supplies.ts; app/api/supplies and app/api/supply-orders use Postgres when DATA_SOURCE_SUPPLIES=postgres (Apps Script is not called; unset = as before). The two Apps Script lists rebuilt from Postgres: 51/51 and 13/13 rows identical to the live answers (check-supplies-apps-script.mts); 3 routes byte-identical over HTTP on both sources; check-supplies-writes.mts 22/22; add, change, remove an item, create an order (office email logged as dry-run) and change its status over HTTP on Postgres. Test rows removed. Not wired yet: the order a sub sends from the sub portal (submitSupplyOrder goes through /api/subcontractor-portal: Area 13).
- Area 12, step 5: app/supplies/page.tsx redesigned (cards / table, Add and Edit in a sheet, Remove asks in a sheet); app/supply-orders/page.tsx restyled in place (print view and PO PDF untouched). Headless click-through 42/42 at 375 and 1280px on Postgres + dry-run, on rows the test made (removed). Not pressed: Generate PO, Share, Download PDF. On Postgres an edit that sends no stock number keeps the stored one (write checks now 23/23).
- Area 13, step 0: docs/migration-reports/sub-portal-headers.md. Sub Portal Issues 1 row / 12 columns, Photos 3 rows / 14 columns (both MAIN, Apps Script only). The sub portal login is the email alone (no password). Its six actions: load by email, load by session, resolve a complaint, report an issue, order supplies, write an activity line. Live read-only answers saved locally: getSubPortalIssues, getPhotos. The login answer was NOT fetched: it needs a real sub's email and it is not known whether Apps Script writes a line when it is called.
- Area 13, step 1: db/migrations/015_sub_portal.sql applied to dev (sub_portal_issues, photos).
- Area 13, step 2: scripts/migrate/import-sub-portal.mjs. Dry-run, run, re-run clean: 1 issue (linked to a sub and an account), 3 photos (all belong to a complaint that exists), 0 open questions.
- Area 13, step 3: scripts/migrate/verify-sub-portal.mjs → docs/migration-reports/sub-portal-verify.md. Both tables match, every row field by field.
- Area 13, step 4: lib/pg/sub-portal.ts + lib/data/sub-portal.ts; app/api/subcontractor-portal and app/api/notifications use Postgres when DATA_SOURCE_SUB_PORTAL=postgres (Apps Script is not called; unset = as before). The issue list is identical to the live Apps Script answer; check-sub-portal-writes.mts 22/22 (the login answer's rules on real rows with counts only, activity lines, issues, status changes); over HTTP with one made-up sub, two made-up accounts and a made-up complaint: unknown email refused, login, session read, activity line, issue (office email dry-run), supply order (office email dry-run), resolve complaint, logout; the sub's identity always comes from the session, never from what the page sends. Revenue and margin are still stripped from the accounts a sub gets. The supply order email helper moved to lib/supplyOrderEmail.ts. Not compared: the login answer against a live Apps Script login.
- Area 13, step 5: the sub portal page (protected: class names only), its five tab components and app/notifications restyled in place with the kit; kit text on the dark banners made readable (.ui-on-dark). Headless click-through 35/35 at 375 and 1280px on Postgres + dry-run as one made-up sub (removed afterwards): login, unknown email refused, six tabs measured, Mark Resolved by Sub, logout, Notifications. /api/notifications byte-identical on both sources. Not pressed: Submit Issue, Submit Supply Order and Schedule Visit in the screen (the same saves passed over HTTP and in the function checks), a photo upload.
- Area 14: no data. Kit look for the header (full-size links; on a phone they fold behind a Menu button), Dashboard, Help, Settings, Logs, Activity Log (owner-only rule untouched), Follow-ups, Equipment Categories, Crew Link staff page, checklist submissions, the sub's equipment page and the Login page (protected: class names only). Measured at 375 and 1280px; the phone menu clicked. All earlier screens re-measured with the cut-off check: pass. Slip: the scripted pass squeezed the three Login choices and 11 similar cards; the measuring passed them, a screenshot caught it; searched all screens for the pattern and fixed the 12 places. Left alone on purpose: Team Hub, the porter page, the equipment-check page, print pages.
- Area 15, step 1: the last direct Sheets reader moved behind the switches. The subcontractor performance score reads Postgres when SUBS, ACCOUNTS, VISITS and COMPLAINTS are all on (lib/pg/performance.ts via lib/data/subs.ts); the scoring rules stay in one place (lib/googleSheets.ts, split into 'read the rows' and 'score the rows', no rule changed). check-performance.mts: 38 of 38 subs identical between Sheets and Postgres. Not re-compared over HTTP.
- Area 15, step 2: db/migrations/016_foreign_keys.sql applied to dev: 17 links (account_ref → accounts, subcontractor_id → subcontractors) became foreign keys, ON DELETE SET NULL, ON UPDATE CASCADE; 0 orphans before; all ten areas' write checks still pass. The three keys to staff stay out until People is on in production.
- Area 15, step 3: docs/DATA_MODEL.md (from scripts/migrate/data-model.mjs), docs/CUTOVER_RUNBOOK.md (rehearsal, two-stage switch, rollback, what stays on Apps Script, frozen tabs), and the final report docs/migration-reports/checkpoint-15-wrap-up-2026-10-08.md. Final verify of every area against the live sheets: all 33 tables match (2,707 rows). No test rows left on the practice database.
- Portal redesign, step 1 (database + server): db/migrations/017_portal_login.sql (portal_users, portal_tokens, portal_settings with open_to_customers = false, accounts.is_test, portal_access.portal_code_randomized_at); lib/pg/portal-auth.ts (email + password, 24 h one-use links stored as fingerprints, bcrypt, 5 tries then 15 minutes, closed-portal rule), lib/pg/portal-home.ts (next cleanings, past visits, my requests), lib/portalAuth.ts, routes under /api/portal/auth and /api/admin/portal-invite, /api/admin/portal-settings; the old phone + code login and the older portal's lookup answer 410 where the new portal runs; the request routes re-check the login; test accounts left out of staff lists; 392 portal codes that equalled the Account ID randomized on dev (import and verify know); scripts create-test-customer.mts, randomize-portal-codes.mjs, check-portal-login.mts (37/37).
- Portal redesign, step 2 (screens): /portal home with eight big buttons, login, first-time and forgot-password, set-password, Which location, Next cleanings, Past visits, the four request forms, Sent, My requests, Call or text us, English / Español; /customer-portal and the old /portal pages redirect where the new portal runs; staff: 'Portal open to customers' card (OFF) in Settings → Portal and 'Send portal invite' on the account page. Headless click-through 104/104 at 375 and 1280px as the test customer; 9/9 with the switch off (old portals unchanged). Not done on a real phone; no photo attached; portal never opened to customers.
- Portal redesign, step 3: docs/migration-reports/portal-redesign-2026-10-08.md; runbook section for the portal on the day of the switch. 19 of 311 customers with portal access have an email on their account; the list of the 372 accounts without one is in docs/migration-reports/private/ (git-ignored). Today's 3 new visits imported; all tables match the sheets.
- Portal follow-up: Missing emails tab in Accounts Center and Customer email on the account page (Postgres only, same save as the Edit page); Past visits shows passed scheduled cleanings as 'Scheduled cleaning'; Call or text us shows one office number from Settings (empty until typed) plus the manager's name; lib/db.ts picks the database (production: DATABASE_URL always; Vercel Preview: MIGRATION_DATABASE_URL or refuse; local: MIGRATION_DATABASE_URL when set) and next.config.ts stops a preview build without it. Checks: 39/39 script, 37/37 follow-up click-through, 104/104 full portal, three build checks.
- The schedule-visit login check that went to main (5419ffe) is on this branch too: /api/portal/schedule-visit answers 401 unless a subcontractor or staff session is present. Same lines, so the merge keeps the check. tsc, lint (16), build pass.
- Preview fixes: (1) /login stuck on 'Loading managers...' on the Vercel preview was a setting, not code: MIGRATION_DATABASE_URL for Preview (migration/postgres) holds the text 'migration-dev' instead of the connection string, so every database call on the preview fails. The preview build now stops with that message when the value is not a postgres:// address, and the login page says 'could not be loaded' with Try again instead of loading forever (app/login/page.tsx, protected, approved). (2) Logos: the header and every small square logo showed the emblem as a dot (also on the live site: the file was the 138px emblem in the middle of an empty 512px square). scripts/make-logos.mjs rebuilds the files with the emblem centered and filling them; the header uses a margin-free emblem; tab and home-screen icons are the square emblem, and those files now load for logged-out visitors (proxy.ts, protected, approved).

**Next step:** Waiting for Andres: put the practice database's full connection string in MIGRATION_DATABASE_URL (Preview, migration/postgres) in Vercel, or approve Claude doing it; then the preview builds and the staff pages can be checked.

**Facts found (differ from Part A):**
- MAIN = `10MDGl…` "Cleaning World All Accounts" (37 tabs). PORTAL = `15tFKX…` "Customer-Portal" (7 tabs). Confirmed by tab names, not by production env.
- **There is no separate CUSTVISITS sheet.** The id hard-coded in `lib/googleSheets.ts` is the MAIN sheet; `getVisitsByAccountName` reads MAIN `Visits`. C.3 question 4 is closed; Area 6 has nothing to archive.
- ChangeLog is in PORTAL. PORTAL has no `portal-billing-requests` tab.
- MAIN tabs no area claims: `SubSchedules_backup_2026-07-16-03-17-44`, `Email Log`, `Settings`, `Drew & Ryan`, `CancelledAccounts`, `CANCELLED ACCOUNTS AUTOMATIC`, `AcceptedNever Started`, `Sum CW`, `Sum Sub`. Not imported unless code reads them; checked in the area that would own them.
- `.env.local` has no real secrets (all `[SENSITIVE]`) and no `DATABASE_URL`. Real local values live in `.env.development.local`.

**Deadline:** not set.

**Decisions made without Andres** (what | why | how to change it):
- `guard.mjs` will be an allow-list (only the `migration-dev` endpoint `ep-small-credit-auvaagcl` may be used) instead of a forbid-list | the production host is not known on this machine (`.env.local` has no `DATABASE_URL`) and Andres said "use this one only"; an allow-list also blocks any other database | add the production host to `FORBIDDEN_HOSTS` in `guard.mjs` when known; change `ALLOWED_ENDPOINTS` if the dev branch is recreated.
- Lint baseline is 10 errors, not 0: 9 in old `scripts/*.js` (allowed by rule 6) and 1 in `app/map/page.tsx:758` (hook called inside a callback, already on `main`). Rule 6 "lint must pass" is read as "no new errors above this baseline" | the map error predates this branch and fixing it could change how the map behaves | it gets fixed when the map page is redesigned in Area 4b; say so if you want it left alone.
- Dry-run also covers Google Drive photo uploads, which the plan did not list | an upload creates a public file in the company Drive, so it reaches the outside world | remove the check in `lib/googleDrive.ts` if uploads should be real during tests.
- In dry-run, an Apps Script call counts as a read only if its action starts with `get` (or it is a GET with no action); everything else is faked | `sendNewAccountPacket` sends email through a GET, so "POST = write" was not safe | a read that is wrongly faked shows up as `[dry-run]` in the log; add it to the rule in `lib/appsScriptFetch.ts`.
- Parity tester is `parity.mts` run with `npx tsx`, not `parity.mjs` | it has to import the TypeScript in `lib/data/*` | none needed.
- Design: no new font (device rounded font), audit colors with darker amber/red for contrast, kit words in EN/ES/PT in `app/ui/words.ts` | fewer moving parts, AA contrast, rule 9 | change `--ui-font` / `--ui-*` in `app/globals.css`.
- Local-only `ADMIN_SESSION_PASSWORD` / `SUB_SESSION_PASSWORD` and `OUTBOUND_DRY_RUN=1` added to `.env.development.local` | needed to open pages locally; real values are not on this machine | replace with the real values if wanted.
- Rename proposals (Complaints → Problems, etc.) are listed in `app/ui/words.ts` `PROPOSED_RENAMES` and not applied | rule 12 | approve them and they get applied per area.
- Area 1: dates stored as Sheets text + typed column; screens get the text | exact parity with today | read the typed column later when screens format dates themselves.
- Area 1: button words changed on Documents and Extra Services (Upload → Add document, View → Open, Edit → Change, Unhide → Show again, Image → Picture); no page or feature renamed | Part B rule 3 | listed in the Area 1 report for Andres to veto.
- Area 2: no manager is linked to a Staff record (`managers.staff_id` stays empty) | the plan says never auto-set it; 5 of 6 have exactly one same-name Staff record, 1 has none | answer in `migration_overrides` (area people, kind manager_staff, legacy_key = Manager ID, resolved_id = Staff ID) and re-run the import.
- Area 2: foreign keys from `manager_accounts`, `equipment_staff_pins` and `vehicles` to `staff` are NOT added yet, although every value matches today | while Staff is still saved in Sheets, a new staff member would not be in Postgres and the foreign key would block their login, PIN or vehicle in production | add them in the Area 15 wrap-up, after the People switch is on in production.
- Area 2: `staffHasEquipmentCheckoutHistory` always asks Sheets, even with People on Postgres | EquipmentCheckouts moves in Area 5 | Area 5 moves it into `lib/data/equipment.ts`.
- Leo (SUB-004 and SUB-037, same contact, company and email): both kept as two subcontractors, nothing merged, and the names "leo" / "anvil clean" resolve to neither | merging or picking one could attach accounts and pay to the wrong row | Andres picks; a `sub_alias` override points the name at the one to keep.
- Company name "Cleaning World" (SUB-006, SUB-007, SUB-008) is not used to resolve a sub | three different contacts share it | resolve those by contact name; add an override if needed.
- Sub emails are not made unique in the database yet | Leo appears twice with one email | tighten after the Leo answer.
- Permanent sub id = the SUB-0NN shown in column A on 2026-10-07; later subs get the next free number | plan default | none needed; ids never change again.
- 19 activity-log lines whose email matches no current sub stay unlinked | no certain owner | fix the email on the sub and re-run the import.
- Area 3: the activity-log read follows Postgres only when `DATA_SOURCE_SUBS` and `DATA_SOURCE_SUB_PORTAL` are both `postgres` | new log lines are still written by Apps Script until Area 13; reading Postgres earlier would hide them | none needed; it switches itself once Area 13 is on.
- Area 3: on Postgres, the phone used to text a sub still comes from the SECOND Phone column, exactly like Apps Script does today (only 8 of 39 subs have a number there; 28 have one in the first column) | rule 12: changing who gets texts is a behavior change | approve "text the first Phone column, fall back to the second" and it is a 3-line change in `getSubcontractorsAppsScriptShape`.
- Area 3: `addSubcontractor` on Postgres stores the profile fields only and sends nothing | Apps Script source is not in the repo; the rows it made have no Created At / Updated At and no trace of a welcome message | if Apps Script does send something when a sub is added, say so and it gets rebuilt.
- Area 3: screenshots that show real names, phone numbers or money are not saved in the repo | the repo is on GitHub; reports stay free of customer data | they can be regenerated locally with the scripts in the scratch folder, or say "commit them".
- Area 3: "Clear filters" now also clears the Schedule filter | the old button forgot it (it reset the other three and the sort) | one line in `clearFilters`.
- Area 3 detail page: the line "Subcontractor ID: SUB-ROW-n" under the name is gone; the contact name is there instead | Part B rule 3 (no raw IDs), and that ID is a row number that changes | one line to put back.
- Area 3 detail page: an Inactive status now shows gray, not green | the old color check looked for the word "active", which "Inactive" contains | cosmetic; revert in `statusKind`.
- Area 3: `app/sub-center/coverage.tsx` and `coverage-map.tsx` are redesigned in Area 4b, not here | they show account data (`/api/accounts`), and the plan already puts "coverage map" in 4b; the map also needs a Google Maps key to check | none needed.
- Area 4a: 154 accounts have no linked manager, 145 of them because the Manager cell holds a name that is not in the Managers tab (the owner first name), the rest because the cell holds two names or an accented spelling | exact name match only, never guessed | add the missing manager to the Managers tab, or give an `account_manager` override, and re-run the import.
- Area 4a: 3 accounts whose Subcontractor text fits no sub stay unlinked; the same accounts already show under no sub in the app | same rule as the screens | `account_sub` override.
- Area 4a: the account row with no Account ID (sheet row 843) and the two rows with no name are imported as they are | nothing is dropped | fix in Sheets and re-run.
- Leo is still unresolved | the answer said "keep SUB-___" with no number filled in | run `node scripts/migrate/set-override.mjs subs sub_alias leo SUB-004` (or SUB-037) and the same for `"anvil clean"`, then re-run the subs and accounts imports. Today no account names Leo, so nothing depends on it yet.
- The 44 other open questions (now 42 after the answers): each stays at its safest value already recorded (left unlinked, kept as typed, nothing merged or deleted) | Andres, 2026-10-08: "make the safest choice and keep going" | every one is listed in `migration_issues` and in the area reports; an override or a fix in Sheets + re-import changes it.
- Area 4a: Account Updates and Sub Transfer Proposals stay on Apps Script (reads and writes) even with `DATA_SOURCE_ACCOUNTS=postgres`; their data is imported and verified but not switched | saving one makes Apps Script send an email (notify office / the proposal to the sub) whose wording is only in the Apps Script source, which is not in the repo; rebuilding it would be guessing | paste the `.gs` source into `docs/apps-script/` and they get switched in Area 4b.
- Area 4a: "Send new account packet" keeps going to Apps Script on both sources | same reason: the email is written there; the request already carries every field it needs, so it does not depend on where accounts live | switch once the source is available.
- Area 4a: on Postgres a full-record save writes only the fields that differ from what the list shows, and a partial save writes only the fields sent | Apps Script overwrites the whole row, which would turn "$1,560" into "1560" in untouched columns | none needed.
- Area 4a: a new account on Postgres gets Last Updated stamped; Gross Margin and Gross Margin % are stored only if the form sends them | in the sheet only 18 of the 31 newest accounts have them, so what Apps Script does is not certain; no screen reads those two columns | say if they should always be calculated.
- `lib/googleSheets.ts` got one additive change (the read-only switch above) although the plan says the Sheets code stays untouched | found while testing Add New Account: with Portal access = Yes the page asks the server to add a row to the real customer-portal sheet; rule 3 ("never click save locally") is now enforced by Google, not by care | delete the 5 lines; nothing else depends on them.
- Edit Account: the "Change History" box used to say "will be added later … saves back to Google Sheets"; it now says the history is on the account page and links there | the old text was out of date (History exists on the account page) | reword in the page.
- Edit Account: after a save the green "Account saved" message shows for 3 seconds; if "Checklist Needed" or the Crew Link switches failed, that part stays on screen in a box | Part B rule 4 | none needed.
- Account page: the embedded onboarding checklist, checklist editor and History keep their old look for now | they are shared components (`app/components/*`) used by other screens too; they get the new look with the shell in Area 14 | none needed.
- Accounts list: the line "ID: <account id>" under each name is gone | Part B rule 3 (no raw IDs); the ID is still in the address bar and in Full account info | one line to put back.
- Accounts list is not yet split into component files | the split is safer done together with the transfer-proposal builder, which is the other half of the file | next step.
- Area 4a: the Accounts list was not split into app/accounts/_components/ files | a pure file move with no visible change; safer once no other screen work touches the file | split any time, no behavior depends on it
- Transfer proposals: status Sent shows amber (waiting) instead of blue | the UI kit has no blue status; sent means waiting on the sub | add a pill kind if blue is wanted
- Keys tab: every Cleaner dropdown shows Unassigned even when the account has a cleaner (the dropdown compares the cleaner's name with the sub's ID; 383 of 395 would match by contact name). Same before the redesign and on Sheets | fixing it changes what the screen shows and saves, so it needs approval | say yes and it is a 3-line fix
- Keys tab: Generate code and the Copy tick box are not stored anywhere (the Accounts sheet has no Key Code or Copy column; the save reports success and the value is gone after a reload). Left exactly as is on both sources | adding columns is a new feature | approve two new columns (Postgres only) or remove the two controls
- Account update page: the Update ID box and its note to developers were removed | Part B rule 3 (no raw IDs); the ID is still in the address bar | one block to put back
- Account Updates: the Add form opens in a sheet from the main button instead of sitting at the bottom of the page; after a save the sheet closes and the saved message shows on the page | one main action per screen | move it back into the page
- Account Health: an empty Internal notes box now shows the message Internal notes are required (before, the button did nothing and said nothing) | a silent button reads as broken | remove the message
- Account Map: the selected account card sits under the map, not on top of it | on a phone the floating box covered a third of the map | float it again
- Area 5: on return, the Sheets code writes who signed the item IN into the Signed OUT by columns (L and M instead of N and O), so the original signer is lost and Signed in by stays empty. The Postgres version does exactly the same | parity first; fixing it changes stored data | approve the fix and both versions get it (two letters in Sheets, two column names in Postgres)
- Area 5: values written on Postgres are kept as typed (purchase date 2026-05-04 stays 2026-05-04); Sheets may reformat what it is given (USER_ENTERED) | no way to copy the sheet locale exactly; imported rows keep the sheet text | none needed
- Area 5: the Equipment screens keep the big-button look they got on 2026-09-24; only the page frame, the two old pop-ups and the small text were changed | they already pass the Part B rules (measured), and they were approved two weeks ago | proposal 3 in the Area 5 report rebuilds the inside with the shared kit
- Area 6: 27 schedules whose SubID email matches no current subcontractor stay unlinked (the email text is kept and the screens keep working from it) | exact email match only | fix the email on the sub or give a schedule_sub override, then re-run the import
- Area 6: on Postgres a deleted exception or sub visit is removed. In Sheets the cells are blanked, so a deleted row in the middle of the tab comes back as an all-empty entry | an empty entry is noise, not data | none needed
- Local test login: the forged dev cookie lasts 12 hours; it expired mid-run on 2026-10-08 09:10 and one comparison silently fetched the login page instead of data. Caught by the answer sizes and re-run. From here the comparison script is only trusted when the answers are JSON | a redirect to /login returns status 200 | none needed
- Full Calendar: on a phone the Month view is a day-by-day list of the same month instead of a 7-column grid | seven columns at 375px gave 45px cells with 10px text | show the grid on phones again (one CSS rule)
- Area 7: 58 visits whose Account Name matches no account (or more than one) stay unlinked; the name text is kept and every screen keeps working from it | exact name match only, never guessed | rename in Sheets or give a visit_account override, then re-run the import
- Area 7: on Postgres, Add visit saves the visit and sends nothing | the Apps Script addVisit source is not in the repo and nothing in the app or the sheet suggests it emails or texts; the 201 rows it wrote were used to copy its ID and date formats | tell me if adding a visit sends a message today and it gets added
- Area 7: the customer portal's visit read (getVisitsByAccountName) is copied as it is, wrong columns included: it compares the customer's name with the formula Account ID, so it finds nothing today | parity first; fixing it changes what customers see | approve and it reads the right columns on both sources
- Area 7: two visits added in the same second get different IDs on Postgres (the second gets -2) | Apps Script would give both the same ID and the Visit page could only ever open the first | none needed
- Area 8: closing a complaint on Postgres sets Status and Updated At and keeps the resolution text in a new column (resolution_note); the list still shows resolution as blank, as today | the 15 rows Apps Script has closed show it changes only those two cells; the resolution text people are made to type is stored nowhere in the sheet | show the resolution on the screens (one line) once you approve
- Area 8: Resend subcontractor email on Postgres is sent by the app itself: the same New Complaint email it sends on creation, to the subcontractor named on the complaint's account | Apps Script looks the complaint up in the sheet and cannot see complaints that live in Postgres; its own wording is not in the repo | paste the Apps Script source and the wording gets copied
- Area 8: closing a complaint on Postgres sends nothing | no sign that Apps Script emails on close | tell me if it does
- Area 8: the Save changes bug on the complaint page (it creates a second complaint and re-sends the notifications instead of editing) is NOT fixed; the Postgres side behaves exactly the same | it changes behavior and needs your OK | approve and editing becomes a real edit on both sources
- Print: the complaint page, the Visits list and Account Health now print their content | the app hides everything on paper unless a page opts in, and these pages never did, so Print gave a blank page | remove the ui-print-view wrapper on a page to get the blank page back
- Area 9: the To-Do page was restyled in place, not rearranged into sheets | it is the page managers use most and has the most intricate modes (bulk edit, visit completion, print layouts, deep-link highlight); changing where things are without Andres seeing it first is the riskier choice | proposal 3 in the Area 9 report moves the form and filters into sheets
- Area 10: Sales and Reports were restyled in place, not rearranged; tables stay tables and scroll inside their own box on a phone | both are long table-and-print pages; a full rebuild into cards and sheets changes how they are used | proposals 1 and 2 in the Area 10 report
- Area 11: which customer portal is live was not asked; both are treated as live | the staff menu and the login page link to /customer-portal, Settings → Portal hands out the codes only /portal uses, and both read the same access list, so moving the data covers both | say which one to retire and it gets removed in the wrap-up
- Area 11: the requests, complaints and history of /customer-portal stay on Apps Script | the Apps Script source is not in the repo and reading them needs a real customer phone | moves when the Apps Script source is available (Area 15 list)
- Area 11: /api/customer-portal now answers 'no account found' when the phone has no digits in it, on both sources | on Sheets, text such as 'abc' matched the first portal row with access and an empty phone and returned that account to anyone (checked locally: 200 before, 404 after; 2 rows are affected); the login page already demands 10 digits, so no customer is affected | revert the 4 lines in app/api/customer-portal/route.ts
- Area 11: a billing request from /portal is saved on Postgres although Sheets has no portal-billing-requests tab (there the save fails today) | the table holds all four kinds; refusing it on purpose would copy a fault | none needed
- Area 11: a local-only PORTAL_SESSION_PASSWORD was added to .env.development.local | needed to open /portal on localhost; the real value is not on this machine | replace it with the real value if wanted
- Area 11: /api/portal/login now builds a fresh 'Invalid credentials' answer each time | the route reused one answer object, which can be sent only once, so every wrong login after the first got an empty answer and the page said 'Something went wrong' | revert the first hunk in app/api/portal/login/route.ts
- Area 11: /api/portal/login no longer writes the typed phone and portal code into the server log (it logs given/empty) | they are the customer's login | revert that one line
- Area 11: Settings → Portal 'Edit' now opens (as a sheet) | on the old page the panel could never open: the row was marked open by account name but checked by name-plus-row-number | none needed; it is the feature the page already described
- Area 11: the /portal dashboard shows a 'was sent' line after a request | the forms already came back with ?submitted=… but nothing showed it | remove the SENT block in the dashboard page
- Area 11: complaint photos on /portal use the kit photo picker with a limit of 20 photos (there was no limit) | shared component; 20 is far above normal use | change max on the PhotoPicker
- Area 12: Supplies and Supply Orders get their own tables (sub_supplies, sub_supply_orders) and are NOT merged into supply_items / supply_orders / supply_order_lines | those three belong to Team Hub and Crew Link (rule 14), hold a different catalog (21 items vs 51, numeric ids, crews and sites), and matching the two lists by name would be an automatic merge | approve a name-by-name mapping and the two catalogs can be joined later
- Area 12: what the Postgres saves write is my reading of the sheet, not a copy of Apps Script (its source is not in the repo): a new item gets Active 'yes' and Last Updated in the sheet's format; removing sets Status 'Inactive' and Active 'no'; a new order gets a SUPORD id, status New when none is sent, and keeps the group id, category and description the sheet has no column for | the lists read back identical to Apps Script for all 64 existing rows; the saves cannot be compared without writing to the live sheet | adjust lib/pg/supplies.ts if a column should be filled differently
- Area 12: on Postgres the new-order email goes through the app's own office notification (info@ and crm@, 9 plain lines) | every existing order row says the Apps Script email went to those office addresses; its wording is not known | change emailNewSupplyOrder in app/api/supply-orders/route.ts
- Area 13: the sub portal's login answer is rebuilt from the three lists already proven identical to Apps Script (subcontractors, accounts, complaints) plus the supply list, and is NOT compared with a live answer | fetching the live one means sending a real sub's email to the login action, which the rules forbid, and it may write a log line in the live sheet | Andres logs in on a preview with the switch on and compares the screen (click-through in the report)
- Area 13: photos stay on Apps Script (upload and list); the 3 rows are copied to a photos table for the record only | Apps Script owns the Drive folders the photos go into; the app's own Drive upload uses a different folder and its production settings are not known here | moves in the wrap-up once the Drive folder is settled
- Area 13: on Postgres a sub's portal lists the accounts tied to that sub that are not cancelled, and the complaints on those accounts | whether Apps Script shows a sub their cancelled accounts is not known; 75 cancelled accounts are tied to a sub, and showing less is the safer mistake | change CANCELLED in lib/pg/sub-portal.ts
- Area 13: on Postgres a new sub portal issue also sends the office an email (info@ and crm@) | it is not known whether Apps Script emails anyone; an extra office email is the safer mistake than a missed access or alarm issue | remove the sendInternalNotification call in app/api/subcontractor-portal/route.ts
- Area 13: on Postgres the answer to 'report an issue' carries the issue's id | today the route drops it, so the page invents an id and the issue's photos are filed under an id no issue has | none needed
- Area 13: on Postgres 'resolve complaint' sets the status to Resolved by Sub and keeps the sub's note (as 'Resolved by <sub>: …') in the complaint's resolution note, the same way a staff close does | what Apps Script writes for it is not known (the complaint sheet has no resolution column) | adjust handleOnPostgres in the route
- Area 13: /api/subcontractor-issues is left on Apps Script | no screen calls it | delete it or wire it when wanted
- Area 14: the header's links fold behind a Menu button on phones | at 48px each the 11 staff links filled the whole first screen of every page | remove the button and the hidden/sm:flex classes in app/components/CWHeader.tsx
- Area 14: the porter page, the equipment-check page and Team Hub were not restyled | they have their own large-text field design, and rule 14 keeps Team Hub as it is | say so and they get the kit look
- Area 15: lib/googleSheets.ts got a second additive change: getSubcontractorPerformanceMap now calls an exported buildSubcontractorPerformanceMap with the rows it read | copying 150 lines of scoring rules into a Postgres twin would let the two drift apart | inline the function again; nothing else depends on the split
- Area 15: the runbook recommends switching in two stages (CATALOGS + PEOPLE + EQUIPMENT, then the other ten together) instead of one area at a time | an area left on Sheets reads the Accounts tab, which stops changing once Accounts is on Postgres | Andres decides; the switches stay independent in the code
- Portal redesign: the new portal runs only where DATA_SOURCE_CUSTOMER_PORTAL=postgres; with the switch off both old portals work as before | its logins live in Postgres, and 'keep every existing portal feature working' until Andres switches | newPortalOn() in lib/portalSession.ts
- Portal redesign: while 'Portal open to customers' is OFF only test accounts can log in, get a link or be invited; a link is shown on screen only for a test account and only outside production | the guardrail 'no real customer gets invited or messaged' | lib/pg/portal-auth.ts accountsForEmail and app/api/portal/auth/link
- Portal redesign: who may log in = an email on an account that is not cancelled and has portal access ON in Settings → Portal | keeps the existing on/off control per account | accountsForEmail
- Portal redesign: test rows use negative sheet_row numbers | the first version took the next row numbers and blocked three new real visits from importing (found and fixed the same hour) | create-test-customer.mts
- Portal follow-up: the office number is a setting (Settings → Customer Portal Access), left empty | Andres' message had the number blank | type it in Settings; nothing to deploy
- Portal follow-up: the email tools save only where accounts are on Postgres; on Sheets they point to the Edit page | nothing on this branch writes to Sheets, and Andres did not ask for a production change | remove the isPostgres check in app/api/admin/account-emails/route.ts
- Preview safety: after a merge every preview of every branch needs MIGRATION_DATABASE_URL or its build stops | a preview must never fall back to the production database | the check at the top of next.config.ts
- Logos: all rebuilt from the one 138x90 emblem in public/logo-CW-single.png | no larger artwork exists in the project; the 512px icons are that emblem enlarged (centered, right proportions, soft) | put a larger original at SOURCE in scripts/make-logos.mjs and run it

**Blocked and skipped:**
- **Claude in Chrome was not connected**, so page checks use headless Edge from a scratch folder instead (screenshots + measurements). Not retried.
- (resolved 2026-10-07) Reading Google Sheets was blocked until Andres supplied a service-account key, both sheet ids and the Apps Script URL.
- Not tested over HTTP in Area 1: uploading a document (needs a Vercel Blob token, not on this machine) and the geocode routes (need the real Google Maps key). Their Postgres functions are covered by `check-catalogs-writes.mts`.
- Sub-portal login and "log activity" still go through Apps Script (Area 13). A sub added while `DATA_SOURCE_SUBS=postgres` would not be able to log in to the portal until Area 13 is done, so SUBS must not be switched on in production before Area 13.
- Noticed, not changed (existing behavior on both the old and new detail page): saving the edit form for a sub whose Status is blank writes "Active" into Status, because the form shows "Active" when blank. 27 of 39 subs have a blank Status today.
- Slip on 2026-10-07 23:48: the three Area 4a commits `migration(accounts): step 1–3` were pushed while `npx tsc --noEmit` was failing (6 type errors in `scripts/migrate/import-accounts.mts`; the script itself ran correctly). Fixed in the next commit by typing two helpers. Cause: the commit command did not stop on the failed check. From here on the check result is read before the commit command is built.
- Apps Script `getAllAccounts` (the list most staff screens load) answered "Page Not Found" 4 times out of 6 on 2026-10-08 between 07:10 and 07:25 (once after 134 s), while `getAccounts` answered in 3 s. Not caused by any write (none were made). The rebuilt `getAllAccounts` is therefore checked against the live answer only for the fields it shares with `getAccounts`; its one extra field, `cancelledDate`, is checked by format only. Andres: check that the live Accounts screen loads. Apps Script reads are now cached and spaced 20 s apart (`check-accounts-apps-script.mts`).
- Other code still reads the Accounts tab straight from Sheets inside `lib/googleSheets.ts`: the performance score (`getSubcontractorPerformanceMap`), the customer-portal account merge (`getMergedPortalAccounts`, `getCustomerByPhone` …), To-Do, Complaints and Visits lookups. They move with Areas 6–11. Until then `DATA_SOURCE_ACCOUNTS` must not be turned on in production (the plan already says not before Areas 11 and 13).
- Slip 2026-10-08, about 09:45: the first visits parity run asked the Sheets API for the whole Visits tab 611 times in a row (one read listed every visit by id; the Sheets function re-reads the tab on each call). Google answered Quota exceeded for about a minute. Read-only, nothing was written, but if the live app shares that quota it may have been slowed for that minute. That read is removed; parity lists now stay under 20 Sheets reads.
- Slip 2026-10-08: my screen checks up to Area 9 tested 'the page does not scroll sideways' but not 'nothing is cut off at the right edge'. On the Sales page a wide table clipped the whole screen at 375px and the check still passed; I saw it in a screenshot. Fixed in the kit for every screen and the check was added. The earlier screens used CardList (cards on phones), which does not have this problem, and To-Do was re-measured; the others were not re-measured one by one.

**Open issues:** `.env.local` has no `DATABASE_URL` (A.1 is wrong about that); production host unknown locally, so the guard is an allow-list; Apps Script source not in repo; two customer portals; CUSTVISITS possibly dead; preview deployments may use prod DB.

**Area log:**

| Area | Status | Est h | Actual h | Started | Finished | Notes |
|---|---|---|---|---|---|---|
| 0 Machinery | done | 6 | 0.5 | 2026-10-07 | 2026-10-07 | Sheets self-test fails: no credentials on this machine |
| B Design system | done | 14 | 0.2 | 2026-10-07 | 2026-10-07 | Contrast not tool-measured; no real phone |
| 1 Catalogs | done | 12 | 0.5 | 2026-10-07 | 2026-10-07 | 19 rows, 0 issues; real file upload/delete not clicked |
| 2 People | done | 11 | 0.2 | 2026-10-07 | 2026-10-07 | 21 rows; 6 manager↔staff questions open; no screens in this area |
| 3 Subs | done | 24 | 0.6 | 2026-10-07 | 2026-10-07 | 17 questions open (Leo twice, phones in the wrong column); Coverage tab moved to 4b |
| 4a Accounts core | done | 34 | 1.6 | 2026-10-07 | 2026-10-08 | 25 questions open (Leo number missing, 9 managers, 3 subs); Account Updates, transfer proposals and the packet stay on Apps Script; transfer builder restyled |
| 4b Accounts secondary | done | 20 | 0.5 | 2026-10-08 | 2026-10-08 | No new tables; 8 screens redesigned; Keys and Account Health bugs reported, not fixed; Google coverage map not testable locally |
| 5 Equipment | done | 20 | 0.7 | 2026-10-08 | 2026-10-08 | 5 tables, tiny data (1 item); return bug copied and reported; screens kept their Sept 24 look inside the shared frame |
| 6 Scheduling | done | 20 | 0.8 | 2026-10-08 | 2026-10-08 | 298 schedules; 27 carry one email no sub has; sub portal and customer portal schedule views not opened (Areas 11, 13) |
| 7 Visits | done | 14 | 0.8 | 2026-10-08 | 2026-10-08 | 611 visits; Apps Script list rebuilt 611/611; 58 visits name an unknown account; customer-portal visit read is broken today (copied, reported) |
| 8 Complaints | done | 24 | 0.7 | 2026-10-08 | 2026-10-08 | 22 complaints; list byte-identical to Apps Script; Edit creates a duplicate complaint today (copied, reported, fix proposed) |
| 9 To-Dos | done | 20 | 0.7 | 2026-10-08 | 2026-10-08 | 127 to-dos, 44 text-log lines; text credit is at 0 (reported); page restyled in place, rearranging proposed |
| 10 Sales/Reports | done | 18 | 0.4 | 2026-10-08 | 2026-10-08 | 2 sales; one shows $0 (amount in the old column); Sales and Reports restyled in place; kit overflow fix |
| 11 Customer portal | done | 22 | 0.8 | 2026-10-08 | 2026-10-08 | 393 portal rows; request tabs empty; both portals kept; a no-digits lookup that returned an account is closed; 30 customers locked out of /portal by shared phones |
| 12 Supplies | done | 24 | 0.5 | 2026-10-08 | 2026-10-08 | 51 supplies, 13 order rows; own tables (not merged into Team Hub's); lists identical to Apps Script; stock columns never shown; sub-portal order path waits for Area 13 |
| 13 Sub portal | done | 28 | 0.7 | 2026-10-08 | 2026-10-08 | 1 issue, 3 photos; portal actions on Postgres behind the switch; login answer not compared with a live login (needs a real sub); email-only login reported; photos stay on Apps Script |
| 14 Shell/rest | done | 12 | 0.5 | 2026-10-08 | 2026-10-08 | header (phone Menu button), dashboard, help, settings, logs, login restyled; every earlier screen re-measured for cut-off content; nothing saved or pressed on these screens |
| 15 Wrap-up | done | 6 | 0.5 | 2026-10-08 | 2026-10-08 | performance score behind the switches (38/38 identical); 17 foreign keys on dev; DATA_MODEL.md; CUTOVER_RUNBOOK.md; final verify: 33 tables match |

**Step log** (`YYYY-MM-DDThh:mm start → end | area/step | commit | note`):
- 2026-10-01 | plan | – | Original plan written.
- 2026-10-07 | plan | – | Condensed version written.
- 2026-10-07T20:31 → 20:33 | 0/step 1 | this commit | Branch created from `main`, plan file added.
- 2026-10-07T20:37 → 20:38 | 0/step 2 | – | Push fixed (signed in as repo owner). Step 2 not done: Neon account has no projects; waiting on Andres.
- 2026-10-07T20:44 → 20:45 | 0/step 2 | this commit | Dev branch URL written to `.env.development.local`, connection verified read-only.
- 2026-10-07T20:45 → 20:47 | 0/step 3 | this commit | Guard + harness. Sheets self-test fails: credentials on this machine are placeholders.
- 2026-10-07T20:48 → 20:49 | 0/step 4 | this commit | Migration runner + shared tables, applied to dev.
- 2026-10-07T20:49 → 20:52 | 0/step 5 | this commit | Data-source flag helper. tsc ok, build ok, lint at baseline (10 pre-existing errors).
- 2026-10-07T20:52 → 20:58 | 0/step 6 | this commit | Outbound dry-run switch + self-test. tsc ok, build ok, lint at baseline.
- 2026-10-07T20:58 → 21:00 | 0/step 7 | this commit | Parity tester + self-test.
- 2026-10-07 21:00 | 0/checkpoint | this commit | Checkpoint 0 report written. Area 0 total: 0.5 h vs 6 h estimate.
- 2026-10-07T21:00 → 21:12 | B | this commit | UI kit + /design-preview. tsc ok, build ok, lint at baseline. Total so far 0.7 h vs 20 h estimate.
- 2026-10-07T22:34 → 22:35 | 1/step 0 | this commit | Discovery script + catalogs headers report.
- 2026-10-07T22:36 → 22:39 | 1/steps 1–2 | this commit (schema file is in the commit before) | Schema applied, import run twice, 0 issues. Added `scripts/migrate/progress.mjs` to update this section.
- 2026-10-07T22:39 | 1/step 3 | this commit | Verify: all tables match.
- 2026-10-07T22:39 → 22:46 | 1/step 4 | this commit | Data layer behind DATA_SOURCE_CATALOGS. tsc ok, build ok, lint at baseline.
- 2026-10-07T22:46 → 22:52 | 1/step 5a | this commit | Documents page redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-07T22:52 → 22:59 | 1/step 5b | this commit | Extra Services page redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-07T22:59 | 1/checkpoint | this commit | Area 1 report. Area total 0.5 h vs 12 h; running total 1.2 h vs 32 h.
- 2026-10-07T22:59 → 23:02 | 2/step 0 | this commit | People headers.
- 2026-10-07T23:02 | 2/step 1 | this commit | People schema.
- 2026-10-07T23:02 | 2/step 2 | this commit | People import; 6 questions logged.
- 2026-10-07T23:02 | 2/step 3 | this commit | People verify: all match.
- 2026-10-07T22:59 → 23:09 | 2/step 4 | this commit | People data layer behind DATA_SOURCE_PEOPLE. tsc ok, build ok, lint at baseline.
- 2026-10-07T23:09 | 2/checkpoint | this commit | Area 2 report. Area total 0.2 h vs 11 h; running total 1.4 h vs 43 h. Estimate not rescaled until Area 3 is measured.
- 2026-10-07T23:09 → 23:14 | 3/step 0 | this commit | Subs headers.
- 2026-10-07T23:14 | 3/step 1 | this commit | Subs schema.
- 2026-10-07T23:14 | 3/step 2 | this commit | Subs import; 17 questions logged.
- 2026-10-07T23:14 | 3/step 3 | this commit | Subs verify: all match.
- 2026-10-07T23:14 → 23:23 | 3/step 4 | this commit | Subs data layer behind DATA_SOURCE_SUBS. tsc ok, build ok, lint at baseline.
- 2026-10-07T23:23 → 23:29 | 3/step 5a | this commit | Subcontractors list redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-07T23:29 → 23:38 | 3/step 5b | this commit | Subcontractor detail page redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-07T23:38 → 23:42 | 3/step 5c | this commit | Sub Center shell + activity log redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-07T23:43 | 3/checkpoint | this commit | Area 3 report. Area total 0.6 h vs 24 h; running total 2.0 h vs 67 h. Remaining re-estimated at 8–25 h.
- 2026-10-07T23:44 → 23:44 | 4a/step 0 | this commit | Accounts headers.
- 2026-10-07T23:48 | 4a/step 1 | this commit | Accounts schema.
- 2026-10-07T23:48 | 4a/step 2 | this commit | Accounts import; 25 questions logged.
- 2026-10-07T23:48 | 4a/step 3 | this commit | Accounts verify: all match.
- 2026-10-07T23:49 | 4a/fix | this commit | tsc fixed after the step 1–3 commits went out with type errors in a migration script.
- 2026-10-08T07:00 → 07:04 | answers | this commit | Overrides for manager "Andres" and 5 manager↔staff links; phone fallback for texting on Postgres. tsc ok, build ok, lint at baseline.
- 2026-10-08T07:02 → 07:33 | 4a/step 4 | this commit | Accounts data layer behind DATA_SOURCE_ACCOUNTS. tsc ok, build ok, lint at baseline.
- 2026-10-08T07:40 | safety | this commit | SHEETS_READ_ONLY switch. tsc ok, build ok, lint at baseline.
- 2026-10-08T07:33 → 07:40 | 4a/step 5a | this commit | Add New Account page redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T07:40 → 07:46 | 4a/step 5b | this commit | Edit Account page redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T07:46 → 07:52 | 4a/step 5c | this commit | Account detail page redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T07:52 → 08:01 | 4a/step 5d | this commit | Accounts list redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T08:15 | 2026-10-08T08:15:01-04:00 accounts step 5e done (transfer builder)
- 2026-10-08T08:16 | 2026-10-08T08:16 | 4a/checkpoint | this commit | Report written; 4a done.
- 2026-10-08T08:30 | 2026-10-08T08:30 | 4b/step 0 + 5a | this commit | Discovery; Accounts Center redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T08:30 | 2026-10-08T08:30 | 4b/step 5b | this commit | Account Updates redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T08:39 | 2026-10-08T08:39 | 4b/step 5c | this commit | Account Health redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T08:39 | 2026-10-08T08:39 | 4b/step 5d | this commit | Account Map redesigned. tsc ok, build ok, lint at baseline (the map lint error is the old one).
- 2026-10-08T08:39 | 2026-10-08T08:39 | 4b/step 5e | this commit | Coverage tab redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T08:40 | 2026-10-08T08:40 | 4b/checkpoint | this commit | Report written; 4b done.
- 2026-10-08T08:44 | 2026-10-08T08:44 | 5/step 0 | this commit | Equipment headers.
- 2026-10-08T08:44 | 2026-10-08T08:44 | 5/step 1 | this commit | Equipment schema.
- 2026-10-08T08:44 | 2026-10-08T08:44 | 5/step 2 | this commit | Equipment import.
- 2026-10-08T08:44 | 2026-10-08T08:44 | 5/step 3 | this commit | Equipment verify: all match.
- 2026-10-08T08:54 | 2026-10-08T08:54 | 5/step 4 | this commit | Equipment data layer behind DATA_SOURCE_EQUIPMENT. tsc ok, build ok, lint at baseline.
- 2026-10-08T09:09 | 2026-10-08T09:09 | 5/step 5 | this commit | Equipment screens: shared frame, sheets. tsc ok, build ok, lint at baseline.
- 2026-10-08T09:09 | 2026-10-08T09:09 | 5/checkpoint | this commit | Report written; Area 5 done.
- 2026-10-08T09:12 | 2026-10-08T09:12 | 6/step 0 | this commit | Scheduling headers.
- 2026-10-08T09:12 | 2026-10-08T09:12 | 6/step 1 | this commit | Scheduling schema.
- 2026-10-08T09:12 | 2026-10-08T09:12 | 6/step 2 | this commit | Scheduling import; 27 questions (one email).
- 2026-10-08T09:12 | 2026-10-08T09:12 | 6/step 3 | this commit | Scheduling verify: all match.
- 2026-10-08T09:20 | 2026-10-08T09:20 | 6/step 4 | this commit | Scheduling data layer behind DATA_SOURCE_SCHEDULING. tsc ok, build ok, lint at baseline.
- 2026-10-08T09:32 | 2026-10-08T09:32 | 6/step 5 | this commit | Sub Schedules screens redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T09:32 | 2026-10-08T09:32 | 6/checkpoint | this commit | Report written; Area 6 done.
- 2026-10-08T09:38 | 2026-10-08T09:38 | 7/step 0 | this commit | Visits headers.
- 2026-10-08T09:38 | 2026-10-08T09:38 | 7/step 1 | this commit | Visits schema.
- 2026-10-08T09:38 | 2026-10-08T09:38 | 7/step 2 | this commit | Visits import; 39 questions.
- 2026-10-08T09:38 | 2026-10-08T09:38 | 7/step 3 | this commit | Visits verify: all match.
- 2026-10-08T09:49 | 2026-10-08T09:49 | 7/step 4 | this commit | Visits data layer behind DATA_SOURCE_VISITS. tsc ok, build ok, lint at baseline.
- 2026-10-08T10:01 | 2026-10-08T10:01 | 7/step 5 | this commit | Visits screens redesigned. tsc ok, build ok, lint at baseline.
- 2026-10-08T10:01 | 2026-10-08T10:01 | 7/checkpoint | this commit | Report written; Area 7 done.
- 2026-10-08T10:04 | 2026-10-08T10:04 | 8/step 0 | this commit | Complaints headers.
- 2026-10-08T10:04 | 2026-10-08T10:04 | 8/step 1 | this commit | Complaints schema.
- 2026-10-08T10:04 | 2026-10-08T10:04 | 8/step 2 | this commit | Complaints import.
- 2026-10-08T10:04 | 2026-10-08T10:04 | 8/step 3 | this commit | Complaints verify: all match.
- 2026-10-08T10:11 | 2026-10-08T10:11 | 8/step 4 | this commit | Complaints data layer behind DATA_SOURCE_COMPLAINTS. tsc ok, build ok, lint at baseline.
- 2026-10-08T10:23 | 2026-10-08T10:23 | 8/step 5 | this commit | Complaints screens redesigned; print fixed on 3 screens. tsc ok, build ok, lint 16 (was 17).
- 2026-10-08T10:23 | 2026-10-08T10:23 | 8/checkpoint | this commit | Report written; Area 8 done.
- 2026-10-08T10:25 | 2026-10-08T10:25 | 9/step 0 | this commit | To-Dos headers.
- 2026-10-08T10:25 | 2026-10-08T10:25 | 9/step 1 | this commit | To-Dos schema.
- 2026-10-08T10:25 | 2026-10-08T10:25 | 9/step 2 | this commit | To-Dos import; 3 questions.
- 2026-10-08T10:25 | 2026-10-08T10:25 | 9/step 3 | this commit | To-Dos verify: all match.
- 2026-10-08T10:33 | 2026-10-08T10:33 | 9/step 4 | this commit | To-Dos data layer behind DATA_SOURCE_TODOS. tsc ok, build ok, lint 16.
- 2026-10-08T10:43 | 2026-10-08T10:43 | 9/step 5 | this commit | To-Do page restyled. tsc ok, build ok, lint 16.
- 2026-10-08T10:43 | 2026-10-08T10:43 | 9/checkpoint | this commit | Report written; Area 9 done.
- 2026-10-08T10:47 | 2026-10-08T10:47 | 10/step 0 | this commit | Sales headers.
- 2026-10-08T10:47 | 2026-10-08T10:47 | 10/step 1 | this commit | Sales schema.
- 2026-10-08T10:47 | 2026-10-08T10:47 | 10/step 2 | this commit | Sales import; 1 question.
- 2026-10-08T10:47 | 2026-10-08T10:47 | 10/step 3 | this commit | Sales verify: all match.
- 2026-10-08T10:57 | 2026-10-08T10:57 | 10/step 4 | this commit | Sales data layer behind DATA_SOURCE_SALES. tsc ok, build ok, lint 16.
- 2026-10-08T10:57 | 2026-10-08T10:57 | 10/step 5 | this commit | Sales and Reports restyled; kit overflow fix. tsc ok, build ok, lint 16.
- 2026-10-08T10:57 | 2026-10-08T10:57 | 10/checkpoint | this commit | Report written; Area 10 done.
- 2026-10-08T11:01 | Area 11 step 0 done
- 2026-10-08T11:48 | Area 11 done, report written
- 2026-10-08T12:11 | Area 12 done, report written
- 2026-10-08T12:35 | Area 13 done, report written
- 2026-10-08T12:55 | Area 14 done, report written
- 2026-10-08T13:07 | Area 15 done; plan complete
- 2026-10-08T18:06 | Portal redesign done
- 2026-10-08T20:31 | Accounts Center: revenue share now shows one decimal and reads '% of total' (was a whole number, so most rows read 0%). Production-mode run (no DATA_SOURCE switches, Sheets read-only, dry run): 38 of 38 checks pass on the built app; manager list loads 7 names. The local dev server alone fails /portal-requests and /settings/portal on a cold load (Next dev 'failed to pipe response'); the built app does not.
- 2026-10-08T20:49 | Visits: 'Add visit' button moved from the bottom bar to the top of the page (protected file app/visits/page.tsx). Account page: 'Add visit' now opens /visits/new with that account chosen (it opened the visits list).
