## Checkpoint 0 (shared machinery) – 2026-10-07

⚠ **NEEDS YOU: Google Sheets cannot be read from this computer.** Without that, no data can be copied or checked for any area. See "Blocked" below. Everything that does not need Sheets data keeps moving.

Time: 0.5 h actual vs 6 h estimate. Remaining: about 324 h on the original estimate (not re-measured yet; one area is not enough to trust a pace). Projected finish: cannot be given until Sheets access works. Deadline: not set.

### What changed (plain words)
- A separate work branch, `migration/postgres`, is on GitHub. `main` is untouched.
- A practice copy of the database (Neon branch `migration-dev`) is connected. All migration work uses only that copy.
- A safety lock (`scripts/migrate/lib/guard.mjs`) refuses to run against any database except the practice copy.
- A way to add new tables safely and in order (`db/migrations/` + `scripts/migrate/apply.mjs`). The first three bookkeeping tables are in the practice copy: runs, questions, and your answers.
- A per-area switch (`DATA_SOURCE_<AREA>`, default `sheets`). Nothing in the app uses Postgres for Sheets data yet.
- A "practice mode" switch, `OUTBOUND_DRY_RUN=1`: no real texts, emails, push alerts, calendar events, Drive uploads, or Apps Script saves. It is off unless set, so the live app behaves the same.
- A comparison tool (`scripts/migrate/parity.mts`) that will check the Sheets answer against the Postgres answer for every read.

### Checks
| Check | Result |
|---|---|
| Guard refuses another Neon database, a non-Neon host, a look-alike host, a missing URL | ✓ 4 of 4 |
| Guard accepts the practice copy and it answers | ✓ |
| Migration runner: applies once, second run does nothing | ✓ |
| Practice mode: 17 checks with the network trapped | ✓ 17 of 17 |
| Comparison tool self-test | ✓ 8 of 8 |
| `npx tsc --noEmit` | ✓ |
| `npm run build` | ✓ |
| `npm run lint` | 10 errors, all there before this branch (9 in old `scripts/*.js`, 1 in `app/map/page.tsx`). No new ones. |
| Sheets read-only test | ✗ no credentials on this computer |

### Blocked
- **Reading Google Sheets.** `.env.local` was made by `vercel env pull`, which writes the word `[SENSITIVE]` instead of the real values. To unblock, add these real values to `.env.development.local` (it is git-ignored):
  - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
  - `GOOGLE_PRIVATE_KEY`
  - `GOOGLE_MAIN_SHEET_ID`
  - `GOOGLE_SHEET_ID`
  - `GOOGLE_SCRIPT_URL` (needed to read the Apps Script-only data and to run the app locally)
  - For clicking through the app locally: `ADMIN_PASSWORD`, `ADMIN_SESSION_TOKEN`, `SUB_SESSION_PASSWORD`, `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
- Blocked by this, for every area: Step 0 (look at the real columns), Step 2 (copy the data), Step 3 (check the copy), and the local click-through in Step 4.

### Decisions made without you
1. The safety lock is an allow-list (only the practice copy) because the production database address is not on this computer. It blocks production and anything else.
2. "Lint must pass" is read as "no new errors". One old error in `app/map/page.tsx` is left for the map redesign.
3. Practice mode also stops Google Drive photo uploads.
4. In practice mode, an Apps Script call is treated as a read only if its action starts with `get`. Sending the new-account packet goes out as a GET, so "GET = safe" was not true.

### Open questions (C.3), handled by rule 15
Not asked. Each will be decided the safest way when its area is reached and written in PROGRESS: Apps Script source, Leo, Giovanna/Cesar, which customer portal is live, CUSTVISITS, preview deployments, redeploy speed, hand edits in Sheets, deadline.

One you should know now: **Vercel preview deployments of `migration/postgres` use whatever `DATABASE_URL` Vercel has for Preview.** If that is production, previews of this branch read and write the production database. Nothing on this branch writes new kinds of data there yet, and no Vercel settings were changed. Safest fix on your side: set a Preview-only `DATABASE_URL` for this branch to the practice copy.

### Protected files edited
None.

### Readers still on Sheets / Apps Script
All of them. No area has been switched.

### Click-through test on your phone
Nothing to click yet. This step changed no screens.

### How to undo
Nothing is switched on. Code: `git revert` the Phase 0 commits on `migration/postgres`, or delete the branch. Database: delete the Neon branch `migration-dev`.
