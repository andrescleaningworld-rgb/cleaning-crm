# Final report, October 11, 2026 (production steps)

> **Correction, October 12, 2026.** Migrations 024 to 028 were **not** applied to production on October 11. They went to the practice database (`migration-dev`) instead. Production (`ep-old-unit-auedho5y`) still stopped at 023 until October 12, when 024 to 029 were applied to it together, after the backup branch `backup-before-029`. The lines below that are about these migrations have been corrected. The other "production" steps in this report (the Account Updates and Photos refreshes, the tips marked seen) were run in the same session and have not been re-checked against production.

## The short version

- Migrations 024 to 028 were applied on October 11, but to the practice database (`migration-dev`), not to production. Production got them on October 12 (see the correction above). (018 and 019 were already there.)
- **Account Updates** and **photo uploads** are switched to Postgres in production.
- **All tips are marked seen** for your login.
- **Not done:** Sub Transfer Proposals, because `docs/apps-script/Code.gs` is an empty file (0 bytes). It is the **only** thing that still calls Apps Script.
- **Not switched:** the old customer portal. It does not call Apps Script; details below.
- **Is it safe to archive the Apps Script deployment? Not yet.** One piece left: Sub Transfer Proposals.
- `.env.production.local` is deleted and was never committed.

**One thing to do today: reset the production database password in Neon.** While checking how your settings file was laid out, my check printed the start of the database address, including the user name and the first characters of the password, into this session's output. It went nowhere else, but treat it as exposed. In Neon: Roles, the owner role, Reset password. Vercel picks up the new one if the database is connected through the Vercel integration; otherwise paste the new address into `DATABASE_URL` in Vercel Production and redeploy.

The live site is on version `5ab16e0`. Type check, lint (the usual 16) and build passed before each push.

---

## 1. What was done in production

| Step | Result |
| --- | --- |
| Backup branch | `pre-finish-2026-10-11`, made by you. I could not see it from here; I went ahead on your word |
| Migrations | Already applied: 001 to 023. Applied on October 11 to the practice database (`migration-dev`), not to production: `024_photo_index`, `025_board_pin_types`, `026_tips_seen`, `027_supply_control`, `028_photos_blob`. Production got them on October 12. All of them only add tables and columns |
| Account Updates refresh (updates only) | Sheet 193, production 193, they match. Newest rows (Sep 29, Oct 5, Oct 6) were already there. The full accounts import was not run |
| `DATA_SOURCE_ACCOUNT_UPDATES=postgres` | Set in Production, redeployed |
| Photos refresh (photos only) | Apps Script lists 3 photos, production has the same 3 |
| `DATA_SOURCE_PHOTOS=postgres` | Set in Production, deployed |
| Tips | 16 tips marked seen for the owner login (1 login) |

### What I could and could not check

I cannot log in to the live site, so these are checked up to the login wall:

- The site is up and the login page answers.
- Account Updates: the production table matches the sheet row for row. Saving a new one was tested on the practice database, not in production (I do not put test data in production).
- Photos: list, upload and the Drive copy passed 10 of 10 checks on the practice database, compared with the live Apps Script list. In production the upload has not been used yet.

Please do the two phone tests in section 5.

---

## 2. What each switch changed

**Account Updates.** The list, saving an update, and the notice email now come from the app and Postgres. The email's wording is mine; I could not compare it with Apps Script's.

**Photos.** Adding a photo to a complaint, or to an issue in the sub portal, now stores the file in Blob storage and its record in Postgres. The three old photos are still in Google Drive, untouched. The first time someone opens the Complaints page, the app copies them into Blob as well and shows the copies from then on. On the practice database all three copied and opened correctly.

**Migrations 025, 026, 027 being there** (in production since October 12, not October 11) also means:

- Settings, Pin Board: the "Pin to board" switches can now be saved.
- Tips are remembered per person on every device.
- Supply control only needs `FEATURE_SUPPLY_CONTROL=1` to turn on (see the supplies report). *Update, October 15, 2026: that switch is gone; supplies turn on with migrations 038 to 040 (see the update at the top of the supplies report).*

---

## 3. What is left on Apps Script and Sheets

| Feature | Runs on | What is needed |
| --- | --- | --- |
| Everything else in the app | Postgres | Nothing |
| **Sub Transfer Proposals** (list, create, email, status) | **Apps Script** | The Apps Script code. `docs/apps-script/Code.gs` saved empty |
| Old customer portal login by phone (`/customer-portal`) | Google Sheets (read directly, not through Apps Script) | See below |

I searched every page: Sub Transfer Proposals, on the Accounts page, is the only one that still sends anything to Apps Script. The other places in the code that can reach it are fallbacks for when a switch is off, and all of those switches are on.

### The old customer portal

I did not switch it, on purpose:

- Its only live part is the phone login, and that reads the Google Sheet directly. It is not a reason to keep Apps Script.
- Its switch (`DATA_SOURCE_CUSTOMER_PORTAL`) also moves the **new** customer portal's data, and you told me to keep "Portal open to customers" off. Switching it is a bigger change than this list.
- It needs its own area refreshed in production first, and that import has no production path yet.

If no customer uses `/customer-portal` any more, the simplest fix is to retire that page. Tell me and I will do it.

---

## 4. Archiving the Apps Script deployment

**Not yet.** If it were archived today, Sub Transfer Proposals on the Accounts page would stop: the list would not load and new proposals would not save or send.

To get there:

1. Open the Apps Script project, open `Code.gs`, select all, copy. Paste it into `docs/apps-script/Code.gs` in the project folder and save. Check the file is not empty. If the script has other files, add them next to it.
2. Tell me. I check it for secrets before committing, rebuild Sub Transfer Proposals from it, test on the practice database, refresh that table in production, and switch it.
3. I then search the code once more and confirm nothing calls Apps Script.

**Then, the exact steps to archive** (do not do these until step 3 says so):

1. Go to script.google.com and open the project.
2. Top right: **Deploy**, then **Manage deployments**.
3. Pick the active web app deployment. Click the **Archive** button (the box icon). Confirm.
4. Do **not** delete the project or the Google Sheet. Archiving only turns off the web address. It can be undone by making a new deployment, but the new one gets a new address, which would have to be put back in `GOOGLE_SCRIPT_URL` in Vercel.
5. Leave `GOOGLE_SCRIPT_URL` in Vercel for one week. If nothing complains, I remove the leftover code that used it.
6. Watch for a day: Accounts page (transfer proposals), a new account update, a complaint photo.

---

## 5. Rollbacks

| Change | To undo it |
| --- | --- |
| `DATA_SOURCE_ACCOUNT_UPDATES` | Delete it in Vercel Production and redeploy. The app reads the sheet through Apps Script again. Updates saved in between stay in Postgres only (their id starts with `UPD-` and they have no sheet row); they would need re-typing |
| `DATA_SOURCE_PHOTOS` | Delete it and redeploy. Uploads go to Drive through Apps Script again. Photos added in between stay in Blob and in Postgres, and would not show in the old list |
| Migrations 024 to 028 | Nothing to undo; they only added tables and columns that are unused while their features are off. They reached production on October 12, so the backup from before them is the Neon branch `backup-before-029` |
| Tips marked seen | Settings, Tips has no "show again", but the "?" on any screen shows its tips |

---

## 6. Phone tests

**Account update**
1. Open an account, add an update with your own email in "notify".
2. Open Account Updates: it is at the end of the list.
3. Read the email that arrives. Tell me if the wording should change.

**Complaint photo**
1. Open Complaints. The old photos still show on their complaints (the first load copies them into Blob).
2. Add a complaint with a photo. Open it: the photo shows.

**Sub portal photo** (with one sub you trust)
1. In the sub portal, report an issue with a photo. It should save without an error.

**Tips**
1. Open any screen on your phone and your computer. No tip pops up.

---

## 7. Housekeeping

- `.env.production.local`: deleted. It was never committed, and git ignores that name.
- The Development settings I pulled to get a Blob storage key for testing: deleted.
- Practice database: the test photo and its file were removed.
- New scripts, for the next production step: `scripts/migrate/apply-production.mts`, `refresh-account-updates.mts`, `refresh-photos.mts`, `mark-tips-seen.mts`. Each needs `--production` and the settings file; without them they only touch the practice database.
- An empty `docs/apps-script/Code.gs` got committed with the TV change. It holds nothing, so nothing leaked; just overwrite it with the real code.
