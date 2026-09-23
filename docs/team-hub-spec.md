# Team Hub — Spec & Decision Log

Reference doc for all future Team Hub phases. Captures the approved data
model, naming, guardrails, and every explicit decision made through the
Phase 0 → rename pass. Update this file when a later phase changes or adds
to any of these decisions — don't let it go stale.

Formerly named "Site Annex" during initial design; renamed to "Team Hub"
before Phase 1 (see §2). Anything below written in the past tense as
"Annex" in an old file/table name has already been renamed — this doc uses
the current names throughout.

## 1. What Team Hub is

An admin-configured hub, one per customer account, that lets on-site
cleaning crews (in-house or subcontractor) work through a no-login,
tokenized link (`/team-hub/[token]`) instead of a staff account. Each site
has one or more crews; each crew gets its own link and its own worker
roster (workers authenticate to the crew session with a PIN — this is
Phase 1). Admins configure, per crew, which modules are visible and which
library items (checklist tasks, rounds, supply items) that crew sees.

Modules: `checklist`, `rounds`, `handoff`, `requests`, `supplies`, `issues`.

## 2. Naming

| | |
|---|---|
| Display name | **Team Hub** (UI labels, account-page tab, future emails, future PWA manifest name/short_name) |
| Crew-facing route | `/team-hub/[token]` |
| Admin API | `/api/admin/team-hub/*` |
| DB table prefix | `hub_` (e.g. `hub_sites`, `hub_crews`, `hub_workers`, `hub_checklist_library`, …) |
| DB tables kept unrenamed | `supply_items`, `supply_orders`, `supply_order_lines` |
| Code identifiers | `TeamHub` / `teamHub` (e.g. `lib/teamHubDb.ts`, `TeamHubCrew`, `createTeamHubSite`) |
| `activity_log.actor_role` literal | `"team-hub"` |
| Future worker session cookie | `cw_team_hub_session` |
| Key files | `lib/teamHubDb.ts`, `lib/teamHubAccountLookup.ts`, `app/accounts/[id]/team-hub-tab.tsx`, `scripts/setup-team-hub-db.js`, `scripts/seed-team-hub-libraries.js` |

`_archive/site-link/` (the archived, pre-Team-Hub "Site Supply Link"
prototype — see §5) is intentionally left named as-is and excluded from
tsc/ESLint/build. It gets deleted after Phase 4, not renamed.

## 3. Standing guardrails (apply to every phase)

- No new Google Sheets tabs or columns, ever. All Team Hub data lives in
  Postgres.
- Every Team Hub read of account data (name, address, manager, etc.) goes
  through **one** choke-point file, `lib/teamHubAccountLookup.ts`, which
  wraps `getAccountSummaryById` / `getAccountSummariesByIds` from
  `lib/googleSheets.ts`. No other Team Hub file imports from
  `lib/googleSheets.ts` directly — so when Accounts eventually move off
  Sheets, only that one file's implementation changes.
- Team Hub tables store only the stable `account_id` (and `sub_id`) —
  never account names, addresses, or any other Sheets-sourced copy.
- Never store a Google Sheets row number as a reference. Where a stable id
  doesn't exist (e.g. the customer-portal inbox, which only has
  `sheetRow`), store a text snapshot instead and flag it — don't invent a
  fake stable id.
- Equipment stock updates go only through `adjustEquipmentPartStock()` in
  `lib/googleSheets.ts`, so they move cleanly with the Equipment module
  whenever it migrates off Sheets.
- Each phase's report to the user must list every place that phase's new
  code touches Sheets.
- **Every crew-facing screen follows §11's GLOBAL UI RULES** (one main
  action per screen, big buttons, plain EN/ES labels, no hidden menus,
  instant tap feedback, 18px+ text) — added in the simplicity pass, binding
  on every phase from here on, not just the screens that existed when it
  was written.
- Do not modify `app/visits/page.tsx`, `app/subcontractor-portal/page.tsx`,
  or staff login without separate, explicit approval for that specific
  change.
- tsc, ESLint, and build are run as three separate, never-chained
  commands. Build uses
  `NODE_OPTIONS="--max-old-space-size=4096" CIRCLE_NODE_TOTAL=3`.
- No commits unless explicitly requested for that turn.

## 4. Porter Checklist — kept separate, not reused

`checklist_templates` / `checklist_submissions` (the existing `/porter`
no-login checklist feature) are **structurally different** from Team Hub's
checklist model, not just differently named:

- `checklist_templates` is one JSONB blob per account, no shared library,
  no reuse across accounts.
- `checklist_submissions` is one atomic, one-shot snapshot per visit, with
  no worker identity (just a typed name) and no incremental autosave.
- `hub_checklist_library` is a flat, **company-wide shared** catalog;
  `hub_checklist_runs` / `hub_checklist_run_items` are **incremental,
  tap-to-autosave, per-worker** records.

Decision: `hub_checklist_library`, `hub_crew_items`, `hub_checklist_runs`,
`hub_checklist_run_items` are new tables, not a migration of the old ones.
`checklist_templates`, `checklist_submissions`, and `/porter` stay
completely untouched. Only the *code patterns* in `lib/checklistDb.ts` /
`lib/checklistTemplate.ts` (query-layer style, progress counters) carry
over as inspiration — not the tables themselves. Whether Team Hub's
checklist module eventually replaces Porter Checklist is a future decision
for the user, not assumed here.

## 5. Account page integration

`app/accounts/[id]/page.tsx` was not previously tabbed — one continuous
scroll, ~1835 lines. Minimal-diff approach used:

1. One new `useState<"details" | "team-hub">("details")` alongside the
   page's existing ~40 state variables — nothing else touched.
2. A small tab-switcher button row inserted after the "← Back to Accounts"
   link, before the existing content section.
3. The page's existing content wrapped in `{activeTab === "details" && (...)}`
   with **zero changes inside** that block.
4. `{activeTab === "team-hub" && <AccountTeamHubTab .../>}` renders a
   separate file (`app/accounts/[id]/team-hub-tab.tsx`) that does its own
   data fetching against `/api/admin/team-hub/*`.

`<AccountPacketPrintView />` stays unconditional, outside both tab
branches — printing the account packet must keep working regardless of
which tab is active.

## 6. Site Supply Link — archived, not deleted

An earlier, uncommitted prototype ("Site Supply Link": no-login supply
ordering + issue reporting at `/s/[token]`) was superseded by the Team Hub
spec before ever being run/committed. Since it was never committed,
deleting it would lose work, so instead:

| File | Disposition |
|---|---|
| `scripts/setup-site-link-db.js` | Deleted — never run; folded into `setup-team-hub-db.js` under `hub_`/`supply_` names |
| `lib/siteLinkDb.ts` | Moved to `_archive/site-link/` — order/issue logic is Phase 2–4 scope, to be rebuilt under `hub_*` names when those phases land |
| `lib/siteLinkNotify.ts` | Moved to `_archive/site-link/` — pattern (email on order/issue) rebuilt in a later phase using `waitUntil()` from `@vercel/functions`, not `await` |
| `lib/siteLinkRateLimit.ts` | **Kept, not archived** — fully generic, carries forward as-is, unused until Phase 1's public endpoints exist |
| `lib/imageResize.ts` | **Kept, not archived** — fully generic, no rename needed |
| `app/s/layout.tsx`, `app/s/[token]/page.tsx` | Moved to `_archive/site-link/` — replaced by `/team-hub/[token]` in Phase 1 with a different UI (PIN login gate, Today screen, modules) |
| `app/api/site-link/[token]/*` | Moved to `_archive/site-link/` — replaced by `/api/team-hub/[token]/*` in a later phase with crew+worker session validation, not a bare token |
| `app/api/admin/site-links/*` | Moved to `_archive/site-link/` — crew-CRUD portions already informed `app/api/admin/team-hub/crews/route.ts`; supplies/queue portions inform later phases |
| `app/site-links/*` pages | Moved to `_archive/site-link/` — replaced by the Team Hub tab (Phase 0) + a later staff queue page |
| `proxy.ts` (`/s`, `/api/site-link` entries) | Reverted — never shipped |
| `lib/googleSheets.ts` (`getAccountSummaryById`, `getAccountSummariesByIds`) | Kept in place — generic, directly reused by Team Hub via the choke-point file |
| `lib/activityLog.ts` (`"site-link"` role literal) | Mechanism kept; literal renamed straight to `"team-hub"` (skipped `"annex"` as an intermediate) |

`_archive/site-link/` is excluded from `tsconfig.json` and
`eslint.config.mjs` (see the comments in each, updated to say "Team Hub
Phase 4" instead of "Site Annex Phase 4"). It gets deleted after Phase 4
ships, once nothing references it for porting logic anymore.

Also flagged when this decision was made: `proxy.ts`'s `PUBLIC_PATHS`
matching must be **exact-or-subpath**, not `startsWith` — a `startsWith`
match on a short public prefix like `/s` would incorrectly also make
`/settings`, `/site-links`, `/supply-orders`, `/sub-center`, etc. public.
This matters for whatever public prefix Team Hub's crew routes register.

## 7. Data model (as created by `scripts/setup-team-hub-db.js`)

All tables use `CREATE TABLE IF NOT EXISTS` (idempotent, safe to re-run).
Full column lists and FKs live in the script itself — this is a summary.

**Phase 0 tables** (application code touches these now):

- `hub_sites` — `id, account_id UNIQUE, label, supervisor_phone, active, created_at`. One row per account (`UNIQUE account_id`).
- `hub_crews` — `id, site_id → hub_sites, name, crew_type CHECK IN ('porter','night','other'), crew_kind CHECK IN ('sub','inhouse'), sub_id, token UNIQUE, token_version, active, revoked_at`.
- `hub_workers` — `id, crew_id → hub_crews, first_name, pin_hash, active, failed_attempts, locked_until, last_sign_in_at, last_device`. Table created now; admin CRUD/PIN-reset UI ships in Phase 1.
- `hub_crew_modules` — `crew_id, module CHECK IN (the 6 modules), enabled`, PK `(crew_id, module)`.
- `hub_checklist_library` — `id, area, text, default_frequency CHECK IN ('visit','weekly','monthly'), is_note, active`.
- `hub_round_library` — `id, name, default_interval_minutes, active`.
- `supply_items` *(unrenamed)* — `id, name, unit, sort_order, active, equipment_part_id`. `equipment_part_id` is a plain TEXT reference, no FK (Equipment lives in Sheets today).
- `hub_crew_items` — `id, crew_id → hub_crews, item_type CHECK IN ('checklist','round','supply'), item_id, enabled, frequency_override, instance_label, sort_order`. `item_id` is **intentionally not an FK** — it points at different tables depending on `item_type`; validated at the application layer in `lib/teamHubDb.ts`.

**Later-phase tables** (created now, unused until their phase lands):

- `hub_checklist_runs`, `hub_checklist_run_items` (Phase 1+/2) — incremental per-visit checklist completion. `hub_checklist_run_items` has its own `id SERIAL PRIMARY KEY` (not in the original field list — added for correctness, see deviation #1 below) plus `UNIQUE(run_id, crew_item_id)`.
- `hub_round_checks` — one row per round check-in.
- `hub_handoffs` — `site_id, from_crew_id, to_crew_id, worker_id, text, needs_action, status CHECK IN ('open','closed'), closed_by_worker_id, closed_at, close_note, read_at`.
- `hub_requests` — `site_id, crew_id, title, details, due_at, photo_required, status CHECK IN ('open','done','cancelled'), todo_id, portal_request_id, created_by, completed_by_worker_id, completed_at, completion_note`. See §9 (Phase 3) re: `portal_request_id`.
- `supply_orders` / `supply_order_lines` *(unrenamed)* — order header + line items against `supply_items`.
- `hub_issues` — `site_id, crew_id, worker_id, category CHECK IN ('restroom','trash','damage','leak','access','supplies','safety','other'), note, status CHECK IN ('open','resolved'), run_item_id → hub_checklist_run_items, complaint_id, created_at, resolved_at`.
- `hub_photos` — `parent_type CHECK IN ('issue','run_item','round_check','handoff','request_completion'), parent_id, blob_url, worker_id, created_at`. `parent_id` is **intentionally not an FK**, same reasoning as `hub_crew_items.item_id`.

**Flagged deviations from the literal field lists** (confirmed during
Phase 0 review, not silent changes):

1. `hub_checklist_run_items` gets a surrogate `id SERIAL PRIMARY KEY` —
   required because `hub_issues.run_item_id` is a nullable single-column
   FK, and a composite `(run_id, crew_item_id)` key can't be referenced by
   one column. `UNIQUE(run_id, crew_item_id)` preserves "one row per item
   per run."
2. `hub_requests.status CHECK IN ('open','done','cancelled')` and
   `hub_photos.parent_type CHECK IN ('issue','run_item','round_check',
   'handoff','request_completion')` — added after reviewing every status
   transition and photo-attachment point described in the spec; no other
   values were found to be needed for either list.
3. `hub_requests.portal_request_id` is nullable TEXT as specified, but per
   §3's stable-id rule: the customer-portal inbox
   (`listPortalSubmissions` in `lib/googleSheets.ts`) only has `sheetRow`,
   which shifts when rows are inserted/deleted — it must never be stored
   here. The column exists but stays unpopulated until Phase 3 decides how
   to get a real stable id (or falls back to a text snapshot instead).
4. `hub_issues.category` stores `"access"` (not `"access/lock"` verbatim)
   for the access/lock category — `"access/lock"` is the display label,
   not the stored value, matching the equivalent choice already made in
   the archived Site Supply Link code.

## 8. Seed data (`scripts/seed-team-hub-libraries.js`)

Idempotent (select-before-insert on natural key, not a DB constraint).

- `hub_checklist_library`: 50 checklist items across 10 areas (Lobby &
  Entrances, Elevators, Restrooms, Corridors, Conference Room,
  Cafeteria/Break Area, Suite, Stairwells & Garage Lobby, End of Shift,
  Periodic) + 2 pinned notes (area `"General"` — the spec didn't name an
  area for these two, so `"General"` was chosen and flagged) = 52 rows.
- `hub_round_library`: 10 rounds (restrooms per floor, lobby/entrance
  glass, elevators, trash, entrance mats, exterior/smoking area, garage
  elevator lobby, conference room before/after meetings).
- `supply_items`: 12 items (toilet paper, hand towels, soap, seat covers,
  trash liners, feminine hygiene bags, disinfectant, glass cleaner,
  microfiber cloths). Units for items without an explicit spec unit were
  given reasonable defaults, flagged as inferred.

## 9. Phase breakdown

- **Phase 0 — done.** Admin setup only: `hub_sites` (create/deactivate/edit
  per account), `hub_crews` (create/revoke/regenerate-token), module
  toggles, crew-item visibility picker against the read-only libraries,
  the account-page Team Hub tab, and a placeholder "preview as crew" (real
  rendering doesn't exist until Phase 1). No public/crew-facing routes
  exist yet.
- **Phase 1 — done.** Workers as authenticatable identities (PIN-based),
  the crew token + worker PIN session (a fourth iron-session cookie,
  `cw_team_hub_session`, alongside `adminSession`/`subSession`/
  `portalSession`), the real public `/team-hub/[token]` rendering path,
  and the worker CRUD/PIN-reset admin UI (the `hub_workers` table itself
  was created in Phase 0, but its UI ships here). `regenerateTeamHubCrewToken`
  bumps `token_version` specifically so Phase 1 sessions can bind to
  `token_version` (forcing re-auth) rather than the token string, which
  never appears in a session.

  Implementation notes:
  - New files: `lib/teamHubWorkerSession.ts` (session config),
    `app/api/team-hub/[token]/route.ts` (public pre-login GET: site label,
    crew name, active worker roster — no account/sub data, same
    non-distinguishing "not active" shape for missing/revoked/deactivated),
    `app/api/team-hub/[token]/session/route.ts` (GET whoami / POST PIN
    login / DELETE logout), `app/team-hub/layout.tsx` +
    `app/team-hub/[token]/page.tsx` (worker picker → PIN keypad → "Today"
    screen listing enabled modules as "Coming soon" tiles — module content
    itself is Phase 2), `app/api/admin/team-hub/workers/route.ts` (admin
    CRUD, audit-logged like manager password resets).
  - `lib/teamHubDb.ts` gained the `hub_workers` query layer (bcryptjs PIN
    hashing, 5-attempt/15-minute lockout via `failed_attempts`/
    `locked_until`) and `getActiveTeamHubCrewByToken` (crew+site join,
    active-only). PIN format is 4-6 digits, enforced at the query layer.
  - `proxy.ts`: added `/team-hub` and `/api/team-hub` to `PUBLIC_PATHS`
    (exact-or-subpath, per the §6 warning — doesn't collide with
    `/api/admin/team-hub/*`, which stays behind the default admin gate).
  - New env var `TEAM_HUB_SESSION_PASSWORD` (32+ chars, same shape as
    `ADMIN_SESSION_PASSWORD`) — set in `.env.local` for local dev; **not
    yet set in Vercel preview/production**, needs `vercel env add
    TEAM_HUB_SESSION_PASSWORD` before this ships live.
  - Rate limiting on the login endpoint reuses `lib/siteLinkRateLimit.ts`
    as-is (kept generic in the §6 archive table for exactly this).
  - Verified end-to-end against a throwaway crew/worker in the dev DATABASE_URL
    (not a fixture in source): pre-login roster fetch, correct-PIN login +
    cookie-backed whoami, wrong-PIN rejection, 5th-attempt lockout blocking
    even a correct PIN, logout clearing the session, and a revoked crew
    reading identically to a nonexistent token. Test rows were deleted
    afterward — no seed data left in the database.
  - Sheets touch points from this phase: none. Every new file goes through
    the same `lib/teamHubAccountLookup.ts` choke point rule as Phase 0 (no
    new direct `lib/googleSheets.ts` imports — the worker/session layer
    never reads account data at all).

  PWA + install gate + switch-worker + lockout alert (same Phase 1, added
  in a follow-up pass):
  - **Install gate.** `/team-hub/[token]` checks `display-mode: standalone`
    (and `navigator.standalone` for iOS) client-side before showing
    anything else. Not standalone → renders `InstallGate` only (iOS/Android/
    other step-by-step "Add to Home Screen" instructions, no worker picker,
    no PIN pad). This gates both the login screen and an already-valid
    session — a crew can only use Team Hub from the installed icon, never a
    plain browser tab, by design.
  - **Manifest**, scoped: `app/team-hub/manifest.webmanifest/route.ts`
    (NOT `app/manifest.ts`, which is root-only and untouched), `scope:
    "/team-hub/"`, `start_url` set per-request from a required `?token=`
    query param (a bare `/team-hub` isn't a real page, so the manifest is
    useless without it). `app/team-hub/[token]/page.tsx` injects
    `<link rel="manifest" href="/team-hub/manifest.webmanifest?token=...">`
    itself once it knows its token — this can't be static layout metadata.
  - **Icons**: `public/team-hub-icons/` (`icon-192.png`, `icon-512.png`,
    `icon-512-maskable.png`, `apple-touch-icon.png`), generated via `sharp`
    from the existing `public/icon-512.png` / `maskable-icon-512.png` /
    `apple-touch-icon.png` (already solid-background and safe-zone padded
    for the main app) — reused rather than fabricating new artwork.
    Referenced from the manifest and from `app/team-hub/layout.tsx`'s
    `icons.apple` (static — doesn't vary by token).
  - **Service worker**, scoped: `public/team-hub-sw.js` (pass-through
    `fetch` handler only, no offline caching yet — just enough for
    installability), registered by `app/team-hub/TeamHubServiceWorkerRegister.tsx`
    with explicit `{ scope: "/team-hub/" }`. The main app's `/sw.js` (scope
    `/`, `app/components/ServiceWorkerRegister.tsx`) is untouched; the
    browser resolves which SW controls a given page by longest matching
    scope, so `/team-hub/*` ends up on this one.
  - **proxy.ts**: `/team-hub-icons` and `/team-hub-sw.js` needed their own
    `PUBLIC_PATHS` entries — they're sibling paths of `/team-hub`, not
    sub-paths (no `/team-hub/` prefix), so the existing entry didn't cover
    them. Found via a real 307-to-`/login` in manual testing, not by
    inspection — same explicit-per-asset convention the file already used
    for `/sw.js`, `/manifest.json`, etc.
  - **Switch worker.** The Today screen's "Switch worker" button re-renders
    the same `LoginScreen` (worker picker → PIN) *without* calling
    `DELETE .../session` first — a second successful `POST .../session`
    simply overwrites the existing cookie's `workerId`. `LoginScreen` grew
    an optional `onCancel` for this path (back to Today without switching);
    the original sign-out flow (`DELETE` then re-login) is unchanged.
  - **Lockout email alert.** `verifyTeamHubWorkerPin`'s `"locked"` result
    now carries `{ worker, justLocked }` — `justLocked` is true only on the
    attempt that trips the lock, false on every subsequent attempt while
    already locked, so the login route (`app/api/team-hub/[token]/session/route.ts`)
    fires the alert exactly once per lockout via
    `waitUntil(sendInternalNotification(...))` (fire-and-forget, doesn't
    block the PIN-entry response; `sendInternalNotification` already no-ops
    if email credentials aren't configured).
  - **Rate limiting** now also covers the two GET routes
    (`GET /api/team-hub/[token]` and `GET /api/team-hub/[token]/session`),
    not just login — same `lib/siteLinkRateLimit.ts` helper, distinct keys
    (`teamhub-get:`, `teamhub-whoami:`, `teamhub-login:`) so one crew's
    heavy polling can't exhaust another action's budget.
  - New env var: none beyond `TEAM_HUB_SESSION_PASSWORD` (already flagged
    above as not yet set in Vercel preview/production).
  - **Caution for whoever reviews this**: verifying the lockout alert live
    (5 wrong PINs against a throwaway test worker) sent a real email via
    the "gmail" `EMAIL_PROVIDER` to `info@cleaningworldinc.com` and
    `crm@cleaningworldinc.com` ("Team Hub: Sam locked out — PWA Crew").
    That's expected real-world behavior for this alert (not a bug), but it
    means those inboxes have one genuine test artifact from this build —
    flagged here in case anyone goes looking for why.
- **Phase 2 — done.** Crew-facing `checklist`/`rounds` run flow.

  Checklist: `hub_checklist_runs` is "one pass through the crew's
  checklist" (a visit/shift) — at most one open run per crew
  (`submitted_at IS NULL`) at a time; a second worker opening the tile
  mid-shift resumes the same open run rather than starting a second one
  (`startTeamHubChecklistRun` is idempotent). Each tap PATCHes
  `hub_checklist_run_items` immediately (optimistic UI, upsert on
  `(run_id, crew_item_id)`) — no separate Save step, so progress survives a
  dropped connection or a worker switch mid-run. `is_note` library items
  (the 2 pinned notes from seed data) render as a non-interactive banner,
  not a checkable row, and aren't counted in the progress bar. Submitting
  (`submitted_at = now()`) is idempotent — a double-tap or retried request
  can't fail or overwrite a later submission. `frequency = 'visit'` items
  (and notes) appear on every run; `'weekly'`/`'monthly'` items only appear
  once due again — not yet completed (any status: done/na/problem) in a
  *submitted* run since the current calendar week/month started
  (`listDueTeamHubChecklistItemsForCrew`). An item already tapped earlier
  in the SAME still-open run stays visible regardless, since only
  submitted runs count toward "done" for this purpose.

  Rounds: **no run concept** — `hub_round_checks` rows are standalone
  timestamped check-ins. The crew view shows each round's most recent
  check-in **today** and how long ago, flagged overdue once that exceeds
  `default_interval_minutes`; a check-in from a previous calendar day
  doesn't count, so it reads as "Not checked today" rather than a stale
  timestamp (`getLatestTeamHubRoundChecksForCrew` filters to
  `checked_at >= startOfDayInTimeZone(now)`).

  Both modules validate every `crewItemId` from the client against
  `hub_crew_items` (`crew_id` + `item_type` + `enabled`) before writing —
  `item_id` isn't an FK (see §7), so this is the only thing stopping a
  tampered id from writing against another crew's item.

  Items with `instance_label` set (e.g. multiple crew_item rows pointing at
  the same library item, one per instance — "Suite A"/"Suite B"/"Suite C")
  already render as fully separate blocks: `instance_label` lives on
  `hub_crew_items`, not the library row, so each instance is its own
  `crew_item_id` and therefore its own independent `<li>` with its own
  status buttons/note/progress accounting — confirmed by direct-SQL test in
  the end-to-end pass below (no crew-facing code change needed). Note: the
  Phase 0 admin crew-item picker (`app/accounts/[id]/team-hub-tab.tsx`)
  currently toggles at most one `hub_crew_items` row per
  `(crew, item_type, item_id)` and has no UI to set `instance_label` at
  all — so today, multiple instances of one item can only be created by a
  direct DB write, not through the admin UI. Flagged as a gap for whichever
  phase builds out the admin picker further, not fixed here (out of Phase
  2's scope).

  Implementation notes:
  - New files: `lib/teamHubWorkerSession.ts` gained
    `requireTeamHubWorkerSession()` (crew/site/worker validity in one call,
    same checks `GET .../session` already did inline — factored out for
    the two new module routes rather than retrofitted into the Phase 1
    session route, to keep this a Phase 2 diff only), used by the two new
    route files: `app/api/team-hub/[token]/checklist/route.ts` (GET items +
    open run + run items; POST `{action:"start"|"submit"}`; PATCH one
    item's status/note) and `app/api/team-hub/[token]/rounds/route.ts` (GET
    items + latest check per item; POST a check-in). `app/team-hub/[token]
    /ChecklistView.tsx` and `.../RoundsView.tsx` are new client components;
    `app/team-hub/[token]/page.tsx`'s `TodayScreen` module tiles for
    `checklist`/`rounds` are now tappable ("Open →" instead of "Coming
    soon") and open these in place of Today via a new `openModule` state,
    the other four modules are unchanged.
  - `lib/teamHubDb.ts` gained the read layer for enabled items
    (`listEnabledTeamHubChecklistItemsForCrew`,
    `listEnabledTeamHubRoundItemsForCrew` — joins `hub_crew_items` against
    the library table matching its `item_type`, since that join target
    isn't FK-enforceable), `listDueTeamHubChecklistItemsForCrew` (the
    weekly/monthly due filter — what the checklist route actually returns),
    the checklist run query layer (start/get-open/list-items/upsert-item/
    submit), and the round check-in layer (record + latest-per-item, now
    day-bounded).
  - New file `lib/teamHubTimezone.ts`: `TEAM_HUB_TIMEZONE = "America/New_York"`
    — one fixed constant, plus `startOfDayInTimeZone`/`startOfWeekInTimeZone`
    (Monday)/`startOfMonthInTimeZone` helpers (built on
    `Intl.DateTimeFormat` offset math, no date library dependency added).
    Every "today"/"this week"/"this month" boundary in Team Hub goes
    through this one constant so a later phase can replace it with a
    per-`hub_sites` timezone column without hunting through call sites.
  - Same rate-limit convention as Phase 1 (`lib/siteLinkRateLimit.ts`,
    distinct keys per route+method: `teamhub-checklist-get:`,
    `-post:`, `-patch:`, `teamhub-rounds-get:`, `-post:`).
  - No new env vars, no proxy.ts changes (`/api/team-hub` was already a
    public-path entry as of Phase 1, and both new routes self-check the
    worker session same as every other Team Hub route).
  - No photo upload in this phase — `hub_photos` supports `'run_item'` and
    `'round_check'` `parent_type`s already, but attaching a photo to a
    checklist item or round check wasn't part of Phase 2's scope. Deferred
    to Phase 4 (see below), which is where blob upload plumbing gets built
    first for supply delivery photos anyway.
  - No `hub_issues` row is created when a checklist item is marked
    "problem" — `status` just records the tap. Wiring that into an actual
    issue (via `hub_issues.run_item_id`) is also deferred to Phase 4 (see
    below), bundled with the photo-upload work rather than Phase 2.
  - Verified via `tsc --noEmit`, `next lint` (scoped to the changed files),
    a full `next build`, and a throwaway-row test against the dev
    `DATABASE_URL` (site/crew/worker/5 crew_items, including two instances
    of the same checklist library item with different `instance_label`s):
    started a run, tapped a 'visit' item, tapped one instance twice to
    confirm upsert-overwrite (not a duplicate row), tapped the other
    instance to 'problem' with a note, submitted (and confirmed re-submit
    is a no-op), confirmed a 'weekly'/'monthly' item drops out of "due"
    only after a *submitted* completion, logged a round check-in and
    confirmed it lands in "today" (ET) while a synthetic 25-hours-ago
    check-in on the same round does not. 18/18 assertions passed; all test
    rows deleted afterward and independently confirmed gone (0 leftover).
  - Sheets touch points from this phase: none — no new file imports
    `lib/googleSheets.ts`.
- **Simplicity pass (between Phase 2 and Phase 3) — done.** UI-only pass
  across the crew app and the admin tab, driven by one rule: a non-tech-
  savvy person must be able to use every screen without help. Data model,
  APIs, and security model unchanged **except** two explicit, deliberate
  exceptions called out below. Established §11's GLOBAL UI RULES, binding
  on every phase from here on.

  **Crew app:**
  - **Install gate removed.** `/team-hub/[token]` no longer blocks on
    `display-mode: standalone` — it works directly in a browser tab from
    the texted link. A small dismissible "Add to Home Screen" banner shows
    once (`localStorage`, never re-shown once dismissed or once already
    standalone) instead of gating the whole app. The manifest/service
    worker/icons from Phase 1's PWA work are untouched — still there for
    whoever does install.
  - **90-day session (deliberate security-adjacent exception).**
    `lib/teamHubWorkerSession.ts`'s `maxAge` went from 8 hours (a shift) to
    90 days — "opening the link goes straight to Today," no re-login. Still
    fully revocable: `regenerateTeamHubCrewToken`'s `token_version` bump
    forces re-auth regardless of `maxAge` (unchanged from Phase 1), and an
    admin deactivating the worker or crew invalidates the session on its
    next check.
  - **Today screen redesigned**: big icon+label+one-status-line tiles
    (`checklist`/`rounds`/`issues` openable, `handoff`/`requests`/`supplies`
    still "Coming soon" — no module content exists for those yet, only the
    tile label changed). Worker identity moved to a small "Not you?" link;
    the old two full-width Switch Worker/Sign Out buttons are gone (Not
    you? reuses the existing overwrite-the-session-on-relogin mechanism
    Phase 1 built, not a new one).
  - **Checklist redesigned**: one area at a time (`Area N of M` + a
    progress bar), tap = done / tap again = undo, big "Next area" ->
    "Finish". The old per-item Done/N-A/Problem three-button row and
    always-expanded full item list are gone. "Undo" needed a genuinely new
    capability — there's no "not done" value in
    `hub_checklist_run_items.status`'s CHECK constraint — so
    `deleteTeamHubChecklistRunItem` (removes the row) and a new
    `DELETE` handler on `/api/team-hub/[token]/checklist` were added.
    `PATCH`'s status values are unchanged (still `done`/`na`/`problem`);
    the simplified UI just never sends anything but `done` now.
  - **"Report a problem" (deliberate scope exception, moved up from Phase
    4).** An always-visible button at the bottom of the checklist screen,
    plus its own crew-facing screen behind the `issues` module tile (same
    `ReportProblemButton` component both places). Free-text note only, no
    photo (Phase 4 still owns photo attachment). This needed a real write
    path that didn't exist before this pass: `reportTeamHubIssue()` in
    `lib/teamHubDb.ts` (inserts a `hub_issues` row, `category = 'other'`,
    `run_item_id` always null — it's not tied to one checklist item) and a
    new `POST /api/team-hub/[token]/issues` route. This is the one place
    this pass added a genuinely new write capability rather than only
    reshaping existing ones — called out explicitly since the pass's own
    brief said "keep the APIs as they are."
  - **Rounds redesigned**: one big button per round, colored green (well
    within interval) / amber (past 50% of interval) / red (overdue or not
    checked today), tap = checked. The old per-item detail card and note
    field are gone — check-ins are always empty-note now from this screen
    (the API still accepts a note; nothing sends one anymore).
  - **EN/ES.** New `app/team-hub/teamHubStrings.ts` — a plain nested-string
    dictionary (not an i18n library; the screen set is small and fixed) —
    plus `useTeamHubLang()` (detects `navigator.language`, overridable via
    a small flag-icon toggle, `localStorage`-remembered per device) and
    `LangToggle.tsx`. Every crew-facing string introduced or touched by
    this pass goes through it; nothing server-rendered depends on language
    (it's resolved client-side after mount, same deferred-read pattern as
    the install-hint dismissal, to avoid an SSR/hydration mismatch).
  - **Light offline handling.** "No signal — saved, will send later":
    checklist taps and round check-ins apply optimistically and stay
    applied even if the network call fails; a failed write is queued
    in-memory and retried once on the browser's `online` event. This is
    *not* a persistent offline queue — a full page reload while offline
    still loses an unsent tap. Flagged as a deliberate scope cut, not an
    oversight; full offline persistence (e.g. IndexedDB) is unscoped.
  - **Instant feedback**: `navigator.vibrate()` (feature-detected, no-ops
    silently where unsupported, e.g. iOS Safari) on every successful tap,
    plus the existing green/checkmark visual state changes.

  **Admin (account page Team Hub tab):**
  - **3-step wizard replaces the old always-visible "create site" +
    freeform "add crew" form**, shown only on first-time setup (no crews
    yet for the site). Step 1 ("Who cleans here?") is two checkboxes (Day
    porter / Night crew, both checked by default) plus an auto-resolved
    sub. Step 2 ("Add workers") is a first-name-only field per checked
    crew with "+ Add another" — **no PIN entry field**: each worker's PIN
    is generated client-side (`crypto.getRandomValues`, 4 digits) at
    creation time and only ever shown once, on the Step 3 screen. Step 3
    ("Send invites") is one "Text invite" button per worker
    (`navigator.share` first, `sms:` link fallback) plus a "Copy" button —
    the message text is bilingual (English then Spanish in the same
    message, not a language picker) and names only the site label, never
    the account name. Once any crew exists for the site, the tab always
    shows the summary view instead (one status line + "Customize" per
    crew) — the wizard never reappears.
  - **Defaults, applied automatically, no picking needed**: Day porter gets
    `rounds`/`handoff`/`supplies`/`issues` modules + every active round;
    Night crew gets `checklist`/`handoff`/`issues` modules + every active
    checklist item and pinned note. Applied via the *existing*
    `/api/admin/team-hub/crew-items` `setModules`/`setCrewItems` actions
    (client-orchestrated — no new endpoint needed for this part).
  - **Sub auto-fill (deliberate scope exception #2 — extends the account
    lookup, per explicit instruction).**
    `lib/teamHubAccountLookup.ts` gained `lookupAssignedSubForAccount()`,
    which resolves an account's raw `Subcontractor` text (a new
    `AccountSummary.subcontractorRaw` field — free, since
    `getAccountSummaryById`/`getAccountSummariesByIds` already read that
    row) against the Subcontractors roster using the *same*
    ambiguity-safe matching `lib/subAccountMatching.ts` already uses
    elsewhere (`resolveAssignedSubKeyWithCandidateCount`) — an exact or
    single fuzzy match auto-fills the sub (`status: "matched"`); anything
    else (`status: "unmatched"` — no raw name, no match, or more than one
    candidate) shows a "Pick the sub" dropdown instead of guessing,
    defaulting to In-house if the admin doesn't touch it. `subId` stored
    on `hub_crews.sub_id` is `getAllSubcontractorsRaw()`'s own `id` field —
    almost always `SUB-ROW-<n>`, a row-position id (see that function's
    comment in `lib/googleSheets.ts`) — reusing the **same** id scheme the
    rest of the app already treats as "the" subcontractor id, not
    inventing a new one. `GET /api/admin/team-hub/sites` now returns
    `assignedSub` alongside `site` (one extra Sheets read on every load of
    the tab, matched/unmatched/site-existing or not — accepted as cheap
    for an admin-only, low-traffic page).
  - **Status line data**: new `getLastSubmittedTeamHubChecklistRunSummary()`
    in `lib/teamHubDb.ts` (last *submitted* run's done/total —
    `totalCount` is the crew's *current* enabled-item count, not a
    historical snapshot, a deliberate simplification) plus reuse of the
    existing `listEnabledTeamHubRoundItemsForCrew`/
    `getLatestTeamHubRoundChecksForCrew` for a rounds-based crew, both
    served by a new `GET /api/admin/team-hub/crew-summary?crewId=`.
  - **Customize** collapses the *entire* original Phase 0/1 editor
    (module toggles, item picker, "Preview as crew", regenerate link,
    reset PIN, deactivate/reactivate worker or crew) behind one
    per-crew toggle — that editor's own code
    (`WorkersSetup`/`VisibilitySetup`/`LibraryPicker`/`PreviewAsCrew`) is
    unchanged by this pass, only re-homed. A small "+ Add another crew"
    (collapsed, off by default) keeps the freeform create-crew form
    available for `crewType: 'other'` or additional instances beyond the
    two wizard defaults.
  - **Not done in this pass** (flagged, not silently skipped): per-worker
    phone numbers are still never stored anywhere (the invite flow reads
    the PIN/link out of component state, not a database column); the
    wizard's site-label field still has to be typed once, prefilled to the
    account name as a *starting point* only — it is never sent anywhere
    until the admin confirms/edits it, so the "site label only, never the
    account name" rule for crew-facing text still holds for what actually
    gets stored and texted.
  - Verified via `tsc --noEmit`, `next lint` (scoped to changed files), and
    a full `next build` — all clean; the new routes (`.../issues`,
    `/api/admin/team-hub/crew-summary`) appear in the build's route list.
    Not exercised against a live crew/admin session in the dev database
    this pass (no new database tables — every write path re-tested here
    reuses Phase 0-2's already-live-tested query layer, plus two small new
    functions built on the same patterns) — flagged as a gap relative to
    Phase 1/2's own live-DB verification.
  - Sheets touch points from this pass: `lib/teamHubAccountLookup.ts`
    (the sanctioned choke point) gained `lookupAssignedSubForAccount()`,
    which reads `getAccountSummaryById()` (existing, one new field) and
    `getAllSubcontractorsRaw()` (existing function, newly called from Team
    Hub) — no other Team Hub file imports `lib/googleSheets.ts` directly.
- **Phase 3 — requests.** "Convert to Team Hub request" from the customer
  portal inbox. Must resolve the `portal_request_id` stable-id question
  flagged in §7 deviation #3 before writing to it.
- **Phase 4 — supplies/delivery, plus photos + issue linkage.** Order
  workflow against `supply_orders`/`supply_order_lines`; "Delivered" status
  decrements stock through `adjustEquipmentPartStock()` (§3).
  `_archive/site-link/` is deleted once this phase ships and nothing needs
  to reference it for porting logic anymore. Also where `hub_photos`
  upload actually gets wired up (first use: supply delivery confirmation
  photos) — bundled into the same phase: attaching a photo to a Phase 2
  checklist item marked "problem" (`parent_type = 'run_item'`) and creating
  the corresponding `hub_issues` row via `hub_issues.run_item_id`, both
  flagged as deferred-to-here in Phase 2's notes above.
- **Phase 5 — not yet scoped in detail.**
- **Phase 6 — full library editors.** Admin CRUD for
  `hub_checklist_library`, `hub_round_library`, and `supply_items` (Phase
  0 only reads them). Also where per-worker OneSignal push registration
  would be wired up, since Team Hub workers have no existing
  `externalUserId` identity for `sendPush()` to target.

## 10. Sheets touch points to watch across phases

- `lib/teamHubAccountLookup.ts` is the only sanctioned import from
  `lib/googleSheets.ts` for account data.
- `adjustEquipmentPartStock()` in `lib/googleSheets.ts` is the only
  sanctioned path for equipment stock changes (Phase 4).
- `listPortalSubmissions()` / `updateSubmissionStatus()` in
  `lib/googleSheets.ts` back the customer-portal inbox that Phase 3's
  "convert to request" reads from — entirely Sheets-backed, row-indexed by
  `sheetRow`, not a stable id (see §7 deviation #3).
- `getAllSubcontractorsRaw()` in `lib/googleSheets.ts` — read by
  `lib/teamHubAccountLookup.ts`'s `lookupAssignedSubForAccount()` (the
  simplicity pass's sub auto-fill) — is otherwise a Subcontractors-page
  function, now also a Team Hub dependency. If its `id` scheme
  (`SUB-ROW-<n>`, row-position-based) ever changes, `hub_crews.sub_id`
  values already stored under the old scheme become stale and won't
  re-match; nothing currently re-validates them after creation.
- No other Team Hub file may import `lib/googleSheets.ts` directly.

## 11. GLOBAL UI RULES (simplicity pass — binding on every phase)

Added mid-project, after Phase 2, driven by one test: **a non-tech-savvy
person must be able to use every crew-facing screen without help or
instructions.** If a phase's design is in doubt on any of these, remove
the thing in doubt rather than add an explainer for it.

- **One main action per screen.** Big buttons, minimum 64px tall, full
  width. Secondary/utility actions (e.g. "Report a problem" on the
  checklist screen) don't count against this — the rule is about the
  screen's primary job, not every button on it.
- **Icons + one or two plain words.** No paragraphs, no jargon, no
  explanations of what a button does — the label and icon have to carry
  it alone.
- **Plain labels, fixed regardless of internal module name**: `checklist`
  → "Checklist", `rounds` → "Checks", `handoff` → "Notes for other shift",
  `requests` → "Tasks", `supplies` → "Order supplies", `issues` → "Report
  a problem". Internal code (`TeamHubModule`, table/column names, API
  payloads) keeps the original module names — only crew-facing display
  text uses these.
- **No hidden menus.** No "...", no long-press, no swipe-to-reveal.
  Everything is either visible on screen or doesn't exist yet as a
  feature.
- **Instant feedback on every tap**: a visible state change (checkmark,
  color change) plus `navigator.vibrate()` where supported (feature-
  detected, silently no-ops where it isn't, e.g. iOS Safari). Errors are
  plain words, not technical messages — "No signal — saved, will send
  later," never a raw fetch error or HTTP status.
- **Minimum 18px text, high contrast.**
- **Language follows the phone (EN/ES)**, with a small flag icon to
  override — see `app/team-hub/teamHubStrings.ts` /
  `useTeamHubLang()` / `LangToggle.tsx`. New crew-facing strings always go
  through this dictionary, in both languages, never hardcoded English.

These rules apply to `/team-hub/[token]` and its sub-screens specifically.
The admin account-page tab follows the spirit (prefilled wizard, plain
status lines, collapsed advanced options) but isn't held to the same
letter — an admin using it is CleaningWorld staff, not the "non-tech-savvy
person without help or instructions" the rule is protecting.
