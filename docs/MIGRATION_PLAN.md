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

**Status:** Phase 0 in progress, full auto (no checkpoints). Branch `migration/postgres` created and pushed. Neon dev branch pending in step 2.

**Done:**
- Phase 0, step 1: branch `migration/postgres` created from `main` (at `5ecae04`), plan committed as `docs/MIGRATION_PLAN.md`.

**Next step:** Phase 0, step 2 (create Neon dev branch `migration-dev` from production, write its pooled URL to `.env.development.local` as `MIGRATION_DATABASE_URL` and `DATABASE_URL`). Stop and ask if it needs Andres's login.

**Deadline:** not set.

**Decisions made without Andres** (what | why | how to change it):
- (none yet)

**Blocked and skipped:**
- (none yet)

**Open issues:** Neon login `cleaningworldoperations@gmail.com` (org Cleaning World) has zero projects, so production lives in another Neon account or a Vercel-managed one (needs Andres); `.env.local` has no `DATABASE_URL` (A.1 says it points at production – it does not), so the production host for `guard.mjs` is unknown (needs Andres); Apps Script source not in repo; two customer portals; CUSTVISITS possibly dead; preview deployments may use prod DB.

**Area log:**

| Area | Status | Est h | Actual h | Started | Finished | Notes |
|---|---|---|---|---|---|---|
| 0 Machinery | in progress | 6 | | 2026-10-07 | | |
| B Design system | not started | 14 | | | | |
| 1 Catalogs | not started | 12 | | | | |
| 2 People | not started | 11 | | | | |
| 3 Subs | not started | 24 | | | | |
| 4a Accounts core | not started | 34 | | | | |
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
