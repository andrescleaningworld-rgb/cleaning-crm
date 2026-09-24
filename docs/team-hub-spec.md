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
prototype — see §6) was intentionally left named as-is and excluded from
tsc/ESLint/build until Phase 4, which used it as reference one last time
(the issue/order route shapes, the admin queue's batched-photos pattern)
and then deleted it entirely, including its `tsconfig.json`/
`eslint.config.mjs` exclusions — see §6 for the historical record of what
it contained.

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
- **No offline mode.** Nothing is ever queued client-side. A failed
  crew-facing write reverts any optimistic UI change and shows the plain
  message **"No signal — try again"** (`common.noSignal` in
  `teamHubStrings.ts`) — never a raw fetch error, never "will send later."
  True offline support is Phase 5, explicitly deferred (see §9) — this
  bullet is the standing behavior until/unless that phase is picked up.
- **SHARED TRANSLATION is a global rule** — see §12. It applies to every
  Team Hub phase from here on **and** to the Equipment Check app (a
  separate, non-Team-Hub app under the same repo) — `lib/translate.ts` is
  deliberately a plain shared utility, not namespaced under `teamHub*`,
  for exactly that reason.

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

## 6. Site Supply Link — archived, then deleted in Phase 4

An earlier, uncommitted prototype ("Site Supply Link": no-login supply
ordering + issue reporting at `/s/[token]`) was superseded by the Team Hub
spec before ever being run/committed. Since it was never committed,
deleting it outright would have lost work — so it was archived instead
(below), used as direct reference while building Phase 4's own order/issue
routes, and then deleted for real once Phase 4 shipped. This table is now
a historical record of what `_archive/site-link/` contained, not a live
file listing:

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

`_archive/site-link/` was excluded from `tsconfig.json` and
`eslint.config.mjs` from Phase 0 through Phase 4 — both exclusions were
removed in Phase 4 along with the directory itself.

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
- `hub_issues` — `site_id, crew_id, worker_id, category CHECK IN ('restroom','trash','damage','leak','access','supplies','safety','other'), note, status CHECK IN ('open','resolved'), run_item_id → hub_checklist_run_items, complaint_id, created_at, resolved_at`. Part 2 added `run_id → hub_checklist_runs` (whole-run linkage — see §9 Phase 4) and `note_english`/`note_language` (§12 SHARED TRANSLATION). `supply_orders` also gained `note_english`/`note_language`.
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

**Build order: Phase 0 → 1 → 2 → simplicity pass → Phase 4 → Phase 6.**
Phase 3 (`handoff`/`requests` — "Notes for other shift"/"Tasks") and Phase 5
(true offline mode) are **deferred**, not skipped — both are marked as such
below and neither Phase 4 nor Phase 6 depends on them.

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
  - **Light offline handling (superseded in Phase 4 — see below).**
    Originally: "No signal — saved, will send later" — checklist taps and
    round check-ins applied optimistically and stayed applied even if the
    network call failed, with a failed write queued in-memory and retried
    once on the browser's `online` event. Phase 4 removed this: with
    offline mode formally deferred to Phase 5 and not yet designed, an
    in-memory "might retry, might not" queue was worse than being honest
    that nothing is saved until the request succeeds — see Phase 4's notes
    for the current behavior ("No signal — try again," optimistic UI
    reverted on failure, no queue).
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
- **Phase 3 — requests — DEFERRED.** `handoff` ("Notes for other shift")
  and `requests` ("Tasks") modules, plus "Convert to Team Hub request" from
  the customer portal inbox. Not started. Must resolve the
  `portal_request_id` stable-id question flagged in §7 deviation #3 before
  writing to it, whenever it's picked back up. **Phase 6 (below) was
  re-scoped to not depend on this** — nothing in Phase 6 needs handoffs or
  requests to exist.
- **Phase 4 — done.** "Order supplies" + full "Report a problem" (category,
  note, photos), plus the admin side (list + one-tap status + manual
  promote-to-complaint) for one account's Team Hub tab.

  **Crew app:**
  - `SuppliesView.tsx` (new): big rows (name + unit) with +/− steppers,
    an optional order-level note (`supply_orders.note` — the schema has no
    per-line note, so this is one note for the whole order, matching what
    was asked), one big "Send order," and a "Recent orders" list below
    with a plain status label (Sent/Ordered/Delivered/Cancelled mapped
    from the existing `new`/`ordered`/`delivered`/`cancelled` DB values —
    "Sent" is the crew-facing label for `new`, chosen because a worker
    tapping Send doesn't think of their own order as merely "new").
  - `IssueReportView.tsx` (new, replaces the simplicity pass's inline
    `ReportProblemButton.tsx`, now deleted): 8 big icon category buttons
    (`hub_issues.category`'s full CHECK list), optional note, up to 5
    photos (camera or gallery via `<input type="file" accept="image/*"
    capture="environment" multiple>`, resized client-side to ~1600px JPEG
    via the existing `lib/imageResize.ts` before upload — no changes to
    that file), one big "Send." Reached two ways: the `issues` module tile
    on Today, and the always-visible button at the bottom of
    `ChecklistView` (now a prop, `onReportProblem`, calling the parent's
    `setOpenModule("issues")` instead of rendering an inline form).
    **"Links the problem to the current run" (resolved for real in Part
    2 — see below).** `hub_issues.run_item_id` is a per-*item* FK, and the
    simplicity pass already removed the per-item Problem status this
    button used to set, so there was never a single checklist item to
    anchor a whole-run report to; `run_item_id` stays null, always.
    Originally (Phase 4) this was interpreted as "the report ties to
    crew/site/timestamp, which is enough" and left there. **Part 2 added a
    real whole-run link**: `reportTeamHubIssue()` now looks up the crew's
    own currently-open checklist run (`getOpenTeamHubChecklistRun`) and
    stores its id in a new column, `hub_issues.run_id` (separate from
    `run_item_id`) — server-determined, not threaded through the client,
    so it applies identically whether the report was opened from the
    checklist screen's button or the Today "issues" tile, whenever a run
    happens to be open at report time. The admin Team Hub tab, staff
    queue, and Sub Center list all show a small "during a checklist run"
    tag on issues where `run_id` is set.
  - **No offline queue.** The simplicity pass's in-memory "retry once on
    reconnect" was removed (Phase 5 owns real offline support, deferred —
    see above). A failed checklist tap or round check-in now reverts its
    optimistic UI change and shows "No signal — try again"
    (`common.noSignal` in `teamHubStrings.ts`, replacing
    `common.noSignalSaved`). Supply orders and issue reports were never
    optimistic (they need the server's response before anything photo-
    related happens), so this only changed `ChecklistView.tsx`/
    `RoundsView.tsx`.

  **New DB layer** (`lib/teamHubDb.ts`, still zero `lib/googleSheets.ts`
  imports in this file):
  - `listEnabledTeamHubSupplyItemsForCrew`, `createTeamHubSupplyOrder`
    (validates every line's `itemId` against the crew's own enabled supply
    items, same defense-in-depth pattern as the checklist/rounds writes),
    `listRecentTeamHubSupplyOrdersForCrew`, `listTeamHubSupplyOrdersForSite`,
    `setTeamHubSupplyOrderStatus` (returns the order WITH lines — the
    admin route needs each line's `equipmentPartId` to decide what to
    decrement, but that Sheets call happens in the route, not here).
  - `reportTeamHubIssue` (now takes a real `category`, was hardcoded
    `'other'`), `listTeamHubIssuesForSite` (photos batched in one extra
    query, not one per issue — same pattern the archived Site Supply
    Link's `listQueue` used), `setTeamHubIssueStatus`,
    `setTeamHubIssueComplaintId` (manual paste-back only).
  - `addTeamHubPhoto` / `getTeamHubPhotosForParents` (`hub_photos`,
    generic across `parent_type`s — Phase 4 only ever writes
    `parent_type = 'issue'`; `run_item`/`round_check`/`handoff`/
    `request_completion` stay unused until whichever phase needs them).

  **New/changed routes:**
  - `POST /api/team-hub/[token]/issues` (public — rewrote the simplicity
    pass's JSON-only version to accept `multipart/form-data`: category,
    note, photos). `POST /api/team-hub/[token]/supplies` (public, new) +
    its `GET`. Both self-check via `requireTeamHubWorkerSession`, rate-
    limited (`teamhub-issues-post:`, `teamhub-supplies-get:`,
    `teamhub-supplies-post:`), and email `info@`/`crm@` via
    `waitUntil(sendInternalNotification(...))` on every new order/problem
    — real account name (resolved through `lookupAccountSummary`, the
    sanctioned choke point), items or note, photo URLs, and a link to
    `/accounts/<id>?tab=team-hub`.
  - `GET`/`POST /api/admin/team-hub/supply-orders` and
    `/api/admin/team-hub/issues` (new, admin-only): list-for-site +
    one-tap status change; the supply-orders route also calls
    `adjustEquipmentPartStock(equipmentPartId, qty, "Restocked")` directly
    for every delivered line that has one — **the second sanctioned direct
    `lib/googleSheets.ts` import in Team Hub**, alongside
    `lib/teamHubAccountLookup.ts` (§3's account-data choke point rule
    doesn't cover equipment stock, which already had its own named
    sanctioned path — see §10).
  - Photos go to Vercel Blob (`team-hub-issues/<issueId>/<uuid>.<ext>`,
    same layout convention the archived Site Supply Link used); type
    (`image/jpeg`/`png`/`heic`/`heif`) and size (max 8MB) are validated
    server-side regardless of what the client already resized, and the
    route 500s cleanly with "Photo storage is not configured" if
    `BLOB_READ_WRITE_TOKEN` is missing rather than failing confusingly
    partway through.
  - **Sample response** — `GET /api/team-hub/[token]/supplies` (site
    label/account name deliberately absent; only the caller's own order
    history):
    ```json
    {
      "success": true,
      "items": [{ "itemId": 4, "name": "Toilet paper", "unit": "case", "instanceLabel": null }],
      "recentOrders": [{
        "id": 12, "status": "new", "createdAt": "2026-09-22T14:03:00.000Z",
        "lines": [{ "itemName": "Toilet paper", "unit": "case", "qty": 2 }]
      }]
    }
    ```

  **Admin (`app/accounts/[id]/team-hub-tab.tsx`):** a new "Orders &
  Problems" section (always visible on the summary view, not collapsed
  behind Customize — an admin needs to see new problems/orders promptly)
  listing every order and problem for the site, photos inline, one-tap
  status buttons (order: Mark Ordered / Mark Delivered / Cancel; issue:
  Resolve/Reopen), and per-issue "Promote to complaint" (opens
  `/complaints/new?accountId=&accountName=&issue=` in a new tab — a small,
  additive prefill added to that page for an `issue` query param, same
  pattern its existing `accountId`/`accountName` prefill already used) +
  a "paste complaint ID back" field that calls `setComplaintId` once the
  admin has actually saved the complaint — **never automatic, never
  touches the sub score**, exactly as instructed.
  `app/accounts/[id]/page.tsx` gained a small `?tab=team-hub` deep-link
  (mirrors the existing `?onboarding=1` pattern) so the notification
  emails' links land directly on the tab.

  **`_archive/site-link/` deleted** (used as direct reference for the
  issue/order route shapes and the admin queue's batched-photos pattern
  while writing this phase, then removed entirely, including its
  `tsconfig.json`/`eslint.config.mjs` exclusions).

  **Verified** via `tsc --noEmit`, `next lint` (scoped, then a full
  `eslint .` after deleting `_archive/` — the only findings were 10
  pre-existing errors/7 warnings in files this phase never touched:
  `app/map/page.tsx`, `app/complaints/page.tsx`,
  `app/api/supplies/route.ts`, three `scripts/*.js` files), a full
  `next build`, and a throwaway-row + real-blob test against the dev
  `DATABASE_URL`/`BLOB_READ_WRITE_TOKEN`: created a site/crew/worker/
  supply crew_item, placed an order with a line, walked its status
  new→ordered→delivered (confirmed the test item has no
  `equipment_part_id`, so the stock-decrement branch is a deliberate
  no-op here — no seed supply item has one, and creating a throwaway
  Equipment part in Sheets to force that branch felt riskier than the
  test was worth), reported an issue and uploaded a real 1×1 JPEG to
  Vercel Blob (fetched it back over HTTP to confirm it's actually public),
  resolved the issue, and stored a manual `complaint_id`. 13/13 assertions
  passed; test rows, the uploaded blob, and the independent re-check all
  confirmed 0 leftovers. **Skipped**: the full "promote to complaint"
  round trip (actually creating a complaint) — no `deleteComplaint()`
  exists in this codebase to clean one up afterward, so only the
  `complaint_id` storage path was tested, not real complaint creation.
  Not exercised: a live HTTP request through the actual Next.js routes
  (session cookies, multipart parsing, rate limiting) — the test exercised
  the same SQL/Blob operations the query layer runs, not the routes
  themselves end-to-end over HTTP.
  Sheets touch points from this phase: `adjustEquipmentPartStock()`
  (new direct import, `app/api/admin/team-hub/supply-orders/route.ts`
  only) and `lookupAccountSummary()` via the existing choke point (email
  notifications' real account name) — no other new Sheets reads.

  **Part 2 additions (build-order Part 2 of the 4-part instruction that
  also produced §12 SHARED TRANSLATION and Phase 6):**
  - **Run linkage** — see the updated "Links the problem to the current
    run" note above.
  - **Notes now go through `lib/translate.ts`.** Both
    `app/api/team-hub/[token]/issues/route.ts` and `.../supplies/route.ts`
    insert the row first (fast, `note_english`/`note_language` still
    null), then — inside the same `waitUntil` that already sent the
    email, sequenced translate-then-email rather than in parallel — call
    `translateToEnglish(note)`, persist it via the new
    `setTeamHubIssueNoteTranslation`/`setTeamHubSupplyOrderNoteTranslation`,
    and use the English text (falling back to the original if translation
    failed) in the outbound email, with an `Original: ...` line appended
    only when the two differ. New shared component
    `app/components/TranslatedText.tsx` renders English-first with a
    "Show original" toggle everywhere a translated note is shown: the
    account Team Hub tab (`IssueRow`, the orders list), the Accounts
    Center staff queue, and the Sub Center read-only list.
  - **Sample response** — `POST /api/team-hub/[token]/issues` (unchanged
    shape from Phase 4 — still no account fields):
    ```json
    { "success": true, "issueId": 42, "photosUploaded": 2 }
    ```
  - **Verified**: `tsc --noEmit`, `eslint` (scoped to every changed file),
    a full `next build` — all clean. A throwaway-row test against the dev
    `DATABASE_URL` (mirroring the SQL directly, plus a real call into
    `lib/translate.ts`, which has no `@/...` aliases and so can be
    imported directly): confirmed a report with no open run gets
    `run_id = null`, a report during an open run gets `run_id` set to
    that run, and a report after the run is submitted goes back to
    `run_id = null`; translated a Spanish `hub_issues.note` and a Spanish
    `supply_orders.note` end-to-end (real Anthropic calls, correct
    `detectedLanguage`, sensible English text), confirmed the original
    column is never overwritten, confirmed an empty note short-circuits to
    `english: "", detectedLanguage: "en"` with no API call, exercised
    `translateTo` for the manager→crew direction, and checked the
    display-contract condition (`TranslatedText`'s toggle logic) against
    both a real translation and an already-English pair. 19/19 assertions
    passed; all test rows deleted and independently confirmed gone (0
    leftover). **Skipped, as instructed**: the "promote to complaint"
    round trip — still no `deleteComplaint()` in this codebase to clean up
    a test complaint afterward, same gap Phase 4 flagged. **Not
    exercised**: a live HTTP request through the actual routes (session
    cookies, multipart parsing, the real `waitUntil` timing) — same gap
    Phase 4 flagged for itself.
  - Sheets touch points from Part 2: none beyond what Phase 4 already had
    — `lib/translate.ts` calls Anthropic, not Sheets, and reuses the
    existing `lookupAccountSummary()` call already in both routes.
- **Phase 5 — offline mode — DEFERRED, not yet scoped in detail.** True
  persistent offline support (survives a page reload while offline —
  e.g. an IndexedDB-backed write queue) for the crew app. The simplicity
  pass's in-memory "retry once on reconnect" approximation of this was
  **removed** in Phase 4 pending real design here — see Phase 4's own
  notes and the updated §11 GLOBAL UI RULES.
- **Phase 6 — done.** Admin CRUD for `hub_checklist_library`,
  `hub_round_library`, and `supply_items` (Phase 0 only read them) — kept
  from the original scope. Also covers, pulled forward because none of it
  needs `handoff`/`requests` to exist: an **activity feed per account**
  (Team Hub tab), a **staff queue** (orders/problems across every account,
  not just one — the Phase 4 admin UI is scoped to one account's Team Hub
  tab only), an **Accounts Center badge for open problems**, a **Sub
  Center read-only list** (orders/problems for a sub's own accounts), and
  a **night-checklist cutoff email alert**. Two things Phase 6 explicitly
  does **not** do, both dropped specifically because Phase 3 is deferred:
  per-worker OneSignal **push alerts to crews** (it was originally going to
  notify on new handoffs/requests — Team Hub workers still have no
  `externalUserId` identity for `sendPush()` to target if a future phase
  revives it), and **To-Do/customer-portal-inbox wiring** ("convert to Team
  Hub request" was Phase 3's own scope — Phase 6 never reads
  `listPortalSubmissions()` or writes a `hub_requests`/To-Do row). Nothing
  in Phase 6 currently needs either.

  **Library CRUD** (`lib/teamHubDb.ts`): `create`/`update`/`set*Active` for
  all three libraries — no delete anywhere (an item can already be
  referenced by a live `hub_crew_items` row or past run history, so
  "remove" is always `setActive(false)`, the same convention every other
  Team Hub admin entity uses). One route, `POST/GET
  /api/admin/team-hub/libraries` (`type: "checklist"|"round"|"supply"`),
  and a new page `app/settings/team-hub-libraries/page.tsx` (linked from
  `/settings`) — these are company-wide catalogs, not per-account, so they
  don't live on the account-page Team Hub tab.

  **Activity feed**: `getTeamHubActivityFeedForSite()` — deliberately NOT
  `lib/activityLog.ts` (the manager/owner audit trail). It's an operational
  feed of what crews actually did (checklist submissions, round check-ins,
  problem reports, supply orders), sourced straight from Team Hub's own
  already-timestamped tables and merged/sorted in JS. Kept separate from
  the two existing activity logs on purpose (same reasoning as Sub Center's
  Activity Log staying separate from Settings' Activity Log — see the
  standing instruction not to merge those). `GET
  /api/admin/team-hub/activity?siteId=`, rendered as a collapsible
  "Activity" section on the account-page Team Hub tab.

  **Staff queue + badge + Sub Center list**: `listOpenTeamHubIssuesAcrossSites`/
  `listOpenTeamHubSupplyOrdersAcrossSites` (all sites) and their `...ForSub`
  equivalents (scoped to `hub_crews.crew_kind='sub' AND sub_id=X`) back
  `GET /api/admin/team-hub/queue` (optional `?subId=`), which resolves
  account names via `lib/teamHubAccountLookup.ts`. Rendered as a new "Team
  Hub" tab in Accounts Center (`app/accounts-center/team-hub-queue.tsx`,
  reusing the existing per-id `/api/admin/team-hub/issues` and
  `/supply-orders` status actions — those already work regardless of which
  account the row belongs to) with a red badge count on the tab itself
  (`getOpenTeamHubIssueCountsByAccount()` via `GET
  /api/admin/team-hub/open-counts`), and a **read-only** "Team Hub" tab in
  Sub Center (`app/sub-center/team-hub.tsx` — no status-change actions;
  those stay on Accounts Center and each account's own tab). Sub names for
  the Sub Center tab come from `lookupSubcontractorNames()`, a new function
  in `lib/teamHubAccountLookup.ts` resolving `hub_crews.sub_id`
  (`getAllSubcontractorsRaw`'s own id scheme) back to a display name — same
  choke-point rule as everything else here.

  **Night-checklist cutoff alert**: `hub_sites` gained two nullable columns
  (`night_checklist_cutoff_time TIME`, `night_checklist_service_days
  SMALLINT[]`, 0=Sun..6=Sat, both null = disabled) and a new table,
  `hub_checklist_alerts_sent (site_id, alert_date, UNIQUE(site_id,
  alert_date))` — the alert's own idempotency guard, separate from
  `hub_checklist_runs` since it tracks "was an email sent," not checklist
  state. `lib/teamHubTimezone.ts` gained `getDateStringInTimeZone`/
  `getDayOfWeekInTimeZone`/`getMinutesSinceMidnightInTimeZone` to evaluate
  the cutoff against `TEAM_HUB_TIMEZONE`. Admin configures it per site from
  a new "Night checklist alert" section on the Team Hub tab (only shown
  once a `night` crew exists), via a new `setNightChecklistAlert` action on
  the existing `/api/admin/team-hub/sites` route.

  A new **Vercel Cron job** (`vercel.json`, `*/15 * * * *`) hits `GET
  /api/cron/team-hub-checklist-alerts`, which calls
  `findTeamHubSitesNeedingNightChecklistAlert()` (past cutoff on a service
  day, active night crew, no submitted run yet today, no alert already sent
  today) and emails info@/crm@ via the existing `sendInternalNotification`
  for each hit, then records it sent. This is the **first cron job in the
  codebase** — `proxy.ts` gained a new self-gated `/api/cron` PUBLIC_PATHS
  entry (Vercel Cron sends no cookies at all; the route checks `Authorization:
  Bearer $CRON_SECRET` itself, same self-checking-route pattern
  `/api/subcontractor-portal` already uses for its own reasons). **New env
  var `CRON_SECRET` — not yet set in Vercel** (same flag Phase 1 raised for
  `TEAM_HUB_SESSION_PASSWORD`); until it's set, the route's own check
  (`!process.env.CRON_SECRET`) rejects every request with 401, so the
  cron is inert rather than open, but no alerts will actually send until
  it's added via `vercel env add CRON_SECRET`.

  **Verified**: `tsc --noEmit`, `eslint` (scoped to every changed/added
  file), and a full `next build` — all clean, every new route appears in
  the build's route list (including `/api/cron/team-hub-checklist-alerts`).
  A throwaway-row script against the dev `DATABASE_URL` (mirroring, not
  importing, the new SQL — plain `node`/`@neondatabase/serverless` can't
  resolve this project's `@/lib/...` TS path aliases) exercised: checklist-
  library create/update/deactivate, all four activity-feed event queries,
  the cross-site open-issue/open-order queries with `account_id` attached,
  badge counts (1 → 0 after resolving), the sub-scoped open-items query,
  and the full night-checklist-alert sequence (past-cutoff detection, no-
  submission detection, the `hub_checklist_alerts_sent` dedup insert firing
  exactly once on a double-insert, and a later submission correctly
  clearing the "needs alert" condition). 15/15 assertions passed; all test
  rows deleted afterward and independently confirmed gone (0 leftover).
  **Not exercised**: a live HTTP request through the actual routes (session
  cookies, the cron's own `CRON_SECRET` check) or the cron on its real
  Vercel schedule — same gap Phase 4 flagged for its own routes.

  **Phase 6 gap pass (Part 3, 2026-09-23)** — closes the gaps between the
  first Phase 6 build and the brief:
  - **Activity feed bug**: the supply-order query counted
    `supply_order_lines.id`, a column that doesn't exist (that table's key
    is `(order_id, item_id)`), so the feed errored on every load. Now
    counts `order_id`.
  - **"Night crew finished 28 of 30"**: new nullable
    `hub_checklist_runs.total_items`, snapshotted by
    `submitTeamHubChecklistRun()` from `listDueTeamHubChecklistItemsForCrew()`
    (notes excluded). Runs submitted before this column read "finished N
    items". Plain-language lines for every event ("Ana (Night crew)
    reported a leak problem — still open").
  - **Feed photos + filters**: run-item, round-check and issue photos are
    attached to events; `GET /api/admin/team-hub/activity` takes
    `kind`, `status` (open|closed — problems/orders only), `crewId`,
    `from`/`to` (America/New_York days). Worker notes use TranslatedText
    (English first, "Show original").
  - **Accounts Center**: besides the tab total, each account row in the
    accounts list now shows a red "N open problems" badge (same
    `/api/admin/team-hub/open-counts`).
  - **Sub Center**: the tab now lists every Team Hub site each sub's crews
    work (account name, site, crews, open problem/order counts) via
    `listTeamHubSubCrewSites()` + `GET /api/admin/team-hub/sub-sites`
    (replaces `subs-with-open-items`, which only listed subs with open
    items). The open items stay one tap away, still read-only.
  - Staff queue and night-checklist alert were already complete; unchanged.

  Sheets touch points from this phase: `lookupAccountSummary()` (cron
  route's email account name) and the new `lookupSubcontractorNames()`
  (Sub Center tab's sub display names), both via the existing
  `lib/teamHubAccountLookup.ts` choke point — no other new Sheets reads,
  and no new direct `lib/googleSheets.ts` imports anywhere in Team Hub.

## 10. Sheets touch points to watch across phases

- `lib/teamHubAccountLookup.ts` is the only sanctioned import from
  `lib/googleSheets.ts` for account data.
- `adjustEquipmentPartStock()` in `lib/googleSheets.ts` is the only
  sanctioned path for equipment stock changes — as of Phase 4, imported
  directly (not through `lib/teamHubAccountLookup.ts`) by
  `app/api/admin/team-hub/supply-orders/route.ts` only, called when an
  order's status is set to `delivered` for any line whose item has an
  `equipment_part_id`.
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
- No other Team Hub file may import `lib/googleSheets.ts` directly — as of
  Phase 4 that's exactly two files: `lib/teamHubAccountLookup.ts` (account
  data, the general choke point) and
  `app/api/admin/team-hub/supply-orders/route.ts` (`adjustEquipmentPartStock`
  only, its own separately-named sanctioned path per §3).

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
  plain words, not technical messages — "No signal — try again" (not
  "...will send later" — there is no queue; see Phase 4/Phase 5 notes),
  never a raw fetch error or HTTP status.
- **Minimum 18px text, high contrast.**
- **Language follows the phone (EN / ES / PT)** — English, Español,
  Português — with an always-visible EN / ES / PT picker (`LangToggle.tsx`
  for Team Hub and the Equipment Check tablet, `LangSwitch` in Crew Link);
  the choice is remembered on the device. See `app/team-hub/teamHubStrings.ts`
  (`TeamHubLang`, `useTeamHubLang()`). New crew-facing strings always go
  through the dictionaries, in all three languages, never hardcoded English.
  Server error messages are English-only, so crew screens show them only in
  English and the dictionary's plain "Something went wrong" otherwise.
- **Crew-facing content** (checklist tabs/sections/items, Team Hub library
  items and rounds, supply items and units) is translated to ES and PT by
  `lib/crewTranslations.ts` into Postgres `content_translations`, keyed by
  the normalized English text (`lib/translationKey.ts`), so unchanged text is
  never re-translated. It runs after every save that can change content
  (`waitUntil`, never blocking the save) and via
  `scripts/backfill-crew-translations.mts`; failures stay missing and are
  retried next time. Crews get a `translations` map with each screen's data
  and fall back to English. Managers always see English; the account's Crew
  Link section has "Review translations" where a manager's correction
  (`manual_text`) overrides the automatic one everywhere that exact English
  text appears.

These rules apply to `/team-hub/[token]` and its sub-screens specifically.
The admin account-page tab follows the spirit (prefilled wizard, plain
status lines, collapsed advanced options) but isn't held to the same
letter — an admin using it is CleaningWorld staff, not the "non-tech-savvy
person without help or instructions" the rule is protecting.

## 12. SHARED TRANSLATION (global rule — added for Phase 4/6, binding beyond Team Hub)

Workers write notes in whichever language they're comfortable in (mostly
Spanish); managers/admins write in English but crews should see it in their
own device language. One shared helper handles both directions, used
everywhere text crosses that boundary — not a Team Hub-only concept, which
is why it lives in a plain `lib/translate.ts`, not `lib/teamHub*.ts`, and
why this rule is written to also bind the future Equipment Check app
(§3, Part 4 of the build).

- **`lib/translate.ts`** — server-only, two functions:
  - `translateToEnglish(text)` → `{ english, detectedLanguage } | null`.
    Detects the language and translates to English in **one** Claude Haiku
    4.5 call — always made (no keyword skip, since crews also write
    Portuguese); when the model reports English, the original is kept (`messages.parse()` + `zodOutputFormat`, the same pattern
    `lib/checklistDocumentExtract.ts` already uses for structured output).
  - `translateTo(text, lang)` → `string | null`. Translates arbitrary text
    to an ISO 639-1 language code.
  - Both use the existing `ANTHROPIC_API_KEY` credential (`new Anthropic()`,
    zero-arg, same as the checklist-extraction path), model
    `claude-haiku-4-5`, and an 8-second per-call timeout
    (`{ timeout: 8000 }` request option) — translation is a nice-to-have
    enrichment, never something a write should hang on.
  - **Skip the call when the text is already in the target language.** A
    cheap, deliberately imprecise heuristic (`looksAlreadyInLanguage` —
    ASCII-only + no common Spanish function words/accented characters ⇒
    "English"; the inverse ⇒ "Spanish") short-circuits the common cases
    (a manager typing English, a worker typing Spanish) without a network
    call. Only tuned for this app's actual pair (EN/ES, matching
    `teamHubStrings.ts`) — any other target language always makes a real
    call. A false negative here just means a real API call runs instead of
    being skipped; it never causes a wrong translation or lost data.
  - **On any failure — missing `ANTHROPIC_API_KEY`, timeout, rate limit, a
    refusal `stop_reason`, a malformed response — both functions return
    `null` and never throw.** The caller's own contract is: on `null`, keep
    the original text and store no translation/detected-language rather
    than blocking or retrying. Translation is best-effort.

- **Storage contract**: every worker-written text field that goes through
  this rule stores three things — the original text as typed, the English
  translation (or the original again, if `translateToEnglish` returned
  `null` or `detectedLanguage === "en"`), and the detected language code.
  Phase 4's `hub_issues.note` and `supply_orders.note` are the first two
  fields to actually implement this (see §9's Phase 4 notes for the
  specific columns) — this section states the rule once so later phases
  and the Equipment Check app follow the same shape instead of each
  inventing their own.
- **Display contract**: admin screens (the Team Hub tab, the staff queue,
  Sub Center) and outbound emails show the **English** text first, with a
  small **"Show original"** toggle to reveal the original-language text
  beneath it. Never show only the original with no English, and never
  auto-translate silently with no way to see what was actually typed.
- **Manager → crew direction**: text a manager/admin writes for a crew to
  see (e.g. a supply-order note echoed back, a future handoff/request
  title) is translated to the crew's device language via `translateTo`
  before it's shown to them — the same `useTeamHubLang()`-detected
  language `teamHubStrings.ts` already uses for the UI's own fixed strings,
  now also applied to admin-authored freeform text.
- This is a **global** rule, not a per-phase opt-in: any future phase (Team
  Hub or not) that stores or displays worker/crew-facing freeform text
  follows this same three-field storage shape and English-first/
  "Show original" display contract, through this same `lib/translate.ts` —
  no phase should build its own translation call.
