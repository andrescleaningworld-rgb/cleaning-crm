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
- **Phase 2 — not yet scoped in detail.** Expected to cover the
  `checklist`/`rounds` modules' actual crew-facing run flow (tap-to-
  complete, autosave), building on `hub_checklist_runs` /
  `hub_checklist_run_items` / `hub_round_checks`, which already exist in
  the schema.
- **Phase 3 — requests.** "Convert to Team Hub request" from the customer
  portal inbox. Must resolve the `portal_request_id` stable-id question
  flagged in §7 deviation #3 before writing to it.
- **Phase 4 — supplies/delivery.** Order workflow against
  `supply_orders`/`supply_order_lines`; "Delivered" status decrements
  stock through `adjustEquipmentPartStock()` (§3). `_archive/site-link/`
  is deleted once this phase ships and nothing needs to reference it for
  porting logic anymore.
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
- No other Team Hub file may import `lib/googleSheets.ts` directly.
