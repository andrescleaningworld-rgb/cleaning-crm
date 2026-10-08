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

**Status:** Phase 0, Part B, Areas 1 (Catalogs), 2 (People) and 3 (Subcontractors) done; reports in `docs/migration-reports/`. Area 4a (Accounts core) next. Full auto (no checkpoints). No `DATA_SOURCE_*` flag is on anywhere; production still reads Sheets. Measured pace is about 3% of the plan estimate: roughly 8–25 h of Claude work left; the open questions in the reports are now the slow part.

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

**Next step:** Area 4a, Step 2 (import).

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

**Blocked and skipped:**
- **Claude in Chrome was not connected**, so page checks use headless Edge from a scratch folder instead (screenshots + measurements). Not retried.
- (resolved 2026-10-07) Reading Google Sheets was blocked until Andres supplied a service-account key, both sheet ids and the Apps Script URL.
- Not tested over HTTP in Area 1: uploading a document (needs a Vercel Blob token, not on this machine) and the geocode routes (need the real Google Maps key). Their Postgres functions are covered by `check-catalogs-writes.mts`.
- Sub-portal login and "log activity" still go through Apps Script (Area 13). A sub added while `DATA_SOURCE_SUBS=postgres` would not be able to log in to the portal until Area 13 is done, so SUBS must not be switched on in production before Area 13.
- Noticed, not changed (existing behavior on both the old and new detail page): saving the edit form for a sub whose Status is blank writes "Active" into Status, because the form shows "Active" when blank. 27 of 39 subs have a blank Status today.

**Open issues:** `.env.local` has no `DATABASE_URL` (A.1 is wrong about that); production host unknown locally, so the guard is an allow-list; Apps Script source not in repo; two customer portals; CUSTVISITS possibly dead; preview deployments may use prod DB.

**Area log:**

| Area | Status | Est h | Actual h | Started | Finished | Notes |
|---|---|---|---|---|---|---|
| 0 Machinery | done | 6 | 0.5 | 2026-10-07 | 2026-10-07 | Sheets self-test fails: no credentials on this machine |
| B Design system | done | 14 | 0.2 | 2026-10-07 | 2026-10-07 | Contrast not tool-measured; no real phone |
| 1 Catalogs | done | 12 | 0.5 | 2026-10-07 | 2026-10-07 | 19 rows, 0 issues; real file upload/delete not clicked |
| 2 People | done | 11 | 0.2 | 2026-10-07 | 2026-10-07 | 21 rows; 6 manager↔staff questions open; no screens in this area |
| 3 Subs | done | 24 | 0.6 | 2026-10-07 | 2026-10-07 | 17 questions open (Leo twice, phones in the wrong column); Coverage tab moved to 4b |
| 4a Accounts core | in progress | 34 |  | 2026-10-07 |  |  |
| 4b Accounts secondary | not started | 20 | | | | |
| 5 Equipment | not started | 20 | | | | |
| 6 Scheduling | not started | 20 | | | | |
| 7 Visits | not started | 14 | | | | |
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
