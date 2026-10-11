# Finish report, October 11, 2026

## The short version

- **The production database was not touched.** `.env.production.local` is not on this computer (I searched the project folder and your user folder), and the Neon login here cannot see the production project, so I could not take the backup branch `pre-finish-2026-10-11`. Your rule was "stop if that fails", so every production database step is waiting.
- Everything that does not need the production database is done, merged and live: tips that stay gone, Edit at the top (checked on all four pages), the updates-only refresh script, and the Team tile in Settings.
- **Is it safe to turn off the Apps Script web app? No.** Four things still call it. The list is in section 4.

Nothing in Production settings changed in this round. Apps Script was not edited, unpublished or turned off.

---

## 1. Production database catch-up: waiting

Not done, for the reason above. What is ready for it:

| Step | State |
| --- | --- |
| Neon backup branch `pre-finish-2026-10-11` | Not made. No access from this computer |
| Migrations 018, 019, 025, 026 on production | Not applied. I could not check which are already there |
| Updates-only refresh script | Written and tested on the practice database: `scripts/migrate/refresh-account-updates.mts` |
| `DATA_SOURCE_ACCOUNT_UPDATES=postgres` in Production | Not set |

About the refresh script:

- It reads only the Account Updates tab and writes only Account Updates rows. It never touches accounts.
- It uses the same row keys as the original copy, so a row is refreshed, never doubled. Rows saved by the app are left alone. Nothing is deleted.
- Without `--write` it only counts. With `--production` it reads the database address from `.env.production.local` and refuses the practice database.
- On the practice database: sheet 193, database 193, they match. The newest three sheet rows (Sep 29, Oct 5, Oct 6) are all there.

### What I need to finish this step

One of these, on this computer:

1. Put `.env.production.local` in `C:\Users\anro_\cleaning-crm` (from the office computer: `vercel env pull .env.production.local --environment=production`). If the database address in it reads `[SENSITIVE]`, copy the real one from Neon into that line.
2. And log this computer's Neon tool in with the account that owns the production project (it is logged in as the operations Gmail, which sees no projects), or make the backup branch yourself in the Neon website and tell me it exists.

Then the order is: backup branch, migrations, `refresh-account-updates.mts --production` (dry run, then `--write`), compare with the sheet, set the switch, redeploy, save one test update.

---

## 2. Fixes

### Tips that stay gone: done, live

Why they kept coming back:

1. A screen's tips were only marked "seen" after the **last** tip. Tap "Got it" on tip 1 of 3 and leave, and they all came back.
2. "Seen" lived only in that one browser. The phone, the computer and the home-screen icon each had their own memory.

What changed:

- Tips count as seen the moment they first show.
- Every tip has **Skip all tips**. It turns all tips off for you.
- Settings has **Don't show tips** (tick or untick, says "Saved ✓").
- The "?" at the top of a screen still shows that screen's tips when you tap it.
- For staff, "seen" is saved in Postgres per person per kind of screen (new table, migration 026). Tips were already per kind of screen, never per record.

**In production today:** the new table is not there yet, so "seen" is still per browser until migration 026 is applied. The first fix and "Skip all tips" work now. **To clear them for yourself: tap "Skip all tips" once on each device** (or tick Don't show tips in Settings). After migration 026, once is enough for all devices. I could not mark them seen for you directly, because that needs the production database.

### Edit at the top: checked on all four pages

Tested here on the account, complaint, visit and subcontractor pages: Edit is in the navy bar, nothing at the bottom, and it opens the same form.

### Settings → Team could not be reached

I found one more cause of "I can't choose": the **Team tile in Settings was hidden** while the Handoffs switch is off, which it is in production. So the page I fixed yesterday had no way in. The tile now always shows.

### Accounts whose sub is not linked

From the practice copy (taken Oct 8). I changed nothing.

| Account | Problem |
| --- | --- |
| Gershen Group- Scotch Plains | Sub is typed "Gabriela". No sub record has that name, so it is not linked |
| 887 Kinderkamack Rd. Realty, LLC | No sub at all |

(A third one with no sub is my own test account, "ZZ Test Customer", which exists only in the practice database.)

---

## 3. Board: add into a box and print

Already live from earlier today. See the previous message for what each box opens and the test steps. Two honest gaps against your list: the Supplies box takes a sticky note because the app has no staff supply-order form yet (your new Supplies request adds one), and New accounts opens the new account form, since "Add accepted estimate" belongs to an account that has to exist first.

---

## 4. What is left on Apps Script and Sheets

Production switches set (names only): Accounts, Catalogs, Complaints, Equipment, People, Sales, Scheduling, Sub portal, Subs, Supplies, To-dos, Visits, Account packet, and the Pin Board. Not set: Account Updates, Customer portal, Handoffs, Sub home, Photos.

No page reads or writes Google Sheets directly any more, except through an area whose switch is off.

| Feature | Where it runs in production | What is needed |
| --- | --- | --- |
| Accounts, subs (list, add, edit), complaints, visits, to-dos, supplies, supply orders, equipment, scheduling, sales, staff and managers, lists | **Postgres** | Nothing |
| Sub portal login, sub activity log, sub issues, notifications | **Postgres** | Nothing |
| New Account packet email | **Postgres** (the app sends it) | Nothing. You have seen one arrive |
| Pin Board, TV, tips | **Postgres** | Migrations 025 and 026 for the last settings |
| **Account Updates** (list, save, notice email) | **Apps Script** | Rebuilt and merged. Needs section 1, then one switch |
| **Sub Transfer Proposals** (list, create, email, accept or decline) | **Apps Script** | Not rebuilt. See below |
| **Photo upload on complaints and in the sub portal** (to Google Drive), and the old Photos list | **Apps Script** | Not rebuilt. See below |
| **Old customer portal** (`/customer-portal` login and requests) | **Apps Script** and Sheets | Switch `DATA_SOURCE_CUSTOMER_PORTAL` is not set. The Postgres version exists; it needs its newest rows copied and the switch |
| Photos page | Off | `FEATURE_PHOTOS` and migration 024 |
| Handoffs (My work, To process), new sub home | Off | Migrations 018 and 019 and their switches |

A correction to my report of October 10: I wrote that editing a subcontractor still went to Apps Script. That was wrong. It has been on Postgres since the Subs switch.

### Why three pieces were not rebuilt

- **Sub Transfer Proposals.** The data is already copied. What I cannot match is the email the sub receives and what happens when the sub accepts or declines. There is no `docs/apps-script/` folder, so I cannot read how Apps Script does either, and I may not send a real proposal to find out. Guessing here would change what subs receive about their pay. I need the Apps Script code pasted into `docs/apps-script/`.
- **Photo uploads and Drive photos.** The app's Google service account is refused by the Drive API ("not enabled for this project"). Until the Drive API is switched on in Google Cloud, the app cannot read, copy or upload Drive files itself. Once it is on, uploads can go to Blob and the old Drive photos can be copied in (originals kept).
- **Old customer portal.** Not risky to build, but flipping it needs the production database, like everything in section 1.

### Is it safe to turn off the Apps Script web app?

**No.** If it were turned off today, these would break:

1. Account Updates: the list and every new update (including the ones saved from an account page and from the board's Office box).
2. Sub Transfer Proposals: all of it.
3. Adding a photo to a complaint, and photo upload in the sub portal.
4. The old customer portal.

It becomes safe when: section 1 is done (item 1), the Apps Script code is in the repo and proposals are rebuilt (item 2), the Drive API is on and photos are rebuilt (item 3), and the customer portal switch is set (item 4). I will then confirm with a search that nothing calls it.

---

## 5. Production changes in this round

| Change | Rollback |
| --- | --- |
| Code only: tips, Team tile, the refresh script, migration file 026 (not applied) | Redeploy the previous version in Vercel (`735b45f`) |

No Production variable was added or changed. No production database change. No backup branch exists, because none could be made.

Earlier today, still in place: `DATA_SOURCE_ACCOUNT_PACKET=postgres` in Production (rollback: delete it and redeploy).

---

## 6. Phone test steps

**Tips**
1. Open a screen you rarely use. If a tip shows, tap **Skip all tips**.
2. Open other screens. No tips.
3. Settings, scroll to **Tips**: "Don't show tips" is ticked. Untick and tick it: "Saved ✓".
4. On any screen, tap **?** at the top. That screen's tips show once, on request.

**Edit at the top**
1. Open an account, a complaint, a visit and a sub. Each has **Edit** in the navy bar.

**Settings → Team**
1. Settings: the **Team** tile is there. Open it, tick a person: "Saved ✓". (If it says it needs a database update, migration 018 is missing in production.)

**A sticky note: add and print**
1. Board, **Whole board**. Tap empty space in **Supply orders**. Give it a title, Save.
2. Tap the note, **Print**. One page with a QR code.
3. Tap the note, **Unpin**.

**An account update** (still through Apps Script until section 1 is done)
1. Board, tap empty space in **Office**. Pick an account, write what changed, Save. A green note appears.
2. Open Account Updates: the update is in the list.

---

## 7. The settings file

`.env.production.local` was never on this computer, so there was nothing to delete. Checked again at the end: it is not in the project folder, and git would ignore it if it were.
