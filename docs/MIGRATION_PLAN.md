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

**Status:** Phase 0, Part B, Areas 1, 2, 3, 4a, 4b, 5, 6 and 7 done; reports in `docs/migration-reports/`. Area 8 (Complaints) next. Full auto (no checkpoints). No `DATA_SOURCE_*` flag is on anywhere; production still reads Sheets. About 6.4 h used of 181 h estimated; roughly 5–16 h of Claude work left.

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

**Next step:** Area 8 (Complaints), Step 0: discovery (Complaints tab, the complaints routes and screens, what Apps Script does on a new complaint: it texts and emails, so dry-run only).

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

**Blocked and skipped:**
- **Claude in Chrome was not connected**, so page checks use headless Edge from a scratch folder instead (screenshots + measurements). Not retried.
- (resolved 2026-10-07) Reading Google Sheets was blocked until Andres supplied a service-account key, both sheet ids and the Apps Script URL.
- Not tested over HTTP in Area 1: uploading a document (needs a Vercel Blob token, not on this machine) and the geocode routes (need the real Google Maps key). Their Postgres functions are covered by `check-catalogs-writes.mts`.
- Sub-portal login and "log activity" still go through Apps Script (Area 13). A sub added while `DATA_SOURCE_SUBS=postgres` would not be able to log in to the portal until Area 13 is done, so SUBS must not be switched on in production before Area 13.
- Noticed, not changed (existing behavior on both the old and new detail page): saving the edit form for a sub whose Status is blank writes "Active" into Status, because the form shows "Active" when blank. 27 of 39 subs have a blank Status today.
- Slip on 2026-10-07 23:48: the three Area 4a commits `migration(accounts): step 1–3` were pushed while `npx tsc --noEmit` was failing (6 type errors in `scripts/migrate/import-accounts.mts`; the script itself ran correctly). Fixed in the next commit by typing two helpers. Cause: the commit command did not stop on the failed check. From here on the check result is read before the commit command is built.
- Apps Script `getAllAccounts` (the list most staff screens load) answered "Page Not Found" 4 times out of 6 on 2026-10-08 between 07:10 and 07:25 (once after 134 s), while `getAccounts` answered in 3 s. Not caused by any write (none were made). The rebuilt `getAllAccounts` is therefore checked against the live answer only for the fields it shares with `getAccounts`; its one extra field, `cancelledDate`, is checked by format only. Andres: check that the live Accounts screen loads. Apps Script reads are now cached and spaced 20 s apart (`check-accounts-apps-script.mts`).
- Other code still reads the Accounts tab straight from Sheets inside `lib/googleSheets.ts`: the performance score (`getSubcontractorPerformanceMap`), the customer-portal account merge (`getMergedPortalAccounts`, `getCustomerByPhone` …), To-Do, Complaints and Visits lookups. They move with Areas 6–11. Until then `DATA_SOURCE_ACCOUNTS` must not be turned on in production (the plan already says not before Areas 11 and 13).
- Slip 2026-10-08 10:05: the first visits parity run asked the Sheets API for the whole Visits tab 611 times in a row (one read listed every visit by id; the Sheets function re-reads the tab on each call). Google answered Quota exceeded for about a minute. Read-only, nothing was written, but if the live app shares that quota it may have been slowed for that minute. That read is removed; parity lists now stay under 20 Sheets reads.

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
| 8 Complaints | not started | 24 | | | | |
| 9 To-Dos | not started | 20 | | | | |
| 10 Sales/Reports | not started | 18 | | | | |
| 11 Customer portal | not started | 22 | | | | |
| 12 Supplies | not started | 24 | | | | |
| 13 Sub portal | not started | 28 | | | | |
| 14 Shell/rest | not started | 12 | | | | |
| 15 Wrap-up | not started | 6 | | | | |

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
