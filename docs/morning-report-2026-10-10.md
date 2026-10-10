# Morning report, October 10, 2026

Short version:

- **Photos**: merged, off in production. Nothing changed for anyone yet.
- **Sub portal**: **not live.** I did not touch the production database or the production settings. Details and what I need from you are below.
- **Pin to board**: finished, merged and **live now** (the Pin Board was already on in production).
- **Apps Script**: two pieces rebuilt and merged, both **off**. Four pieces not done. Nothing in production was flipped, and Apps Script was not touched.

The live site is on version `e9bce0f` (pin to board). After this report is pushed it will be one step further, with the Apps Script pieces in the code but switched off.

Every check was run before each push to main: type check clean, lint at the usual 16, build passes.

---

## 1. Photos

- **Merged?** Yes, into main.
- **In production:** off. `FEATURE_PHOTOS` is not set, so the page and the menu item are hidden. The photo index table was not created in production.
- **Preview link:** https://cleaning-crm-git-featu-5bf1d4-andrescleaningworld-rgbs-projects.vercel.app (practice data, no real emails or texts)

Phone test:

1. Open the preview link and log in.
2. Menu, Work, **Photos**.
3. Tap an account, then a date range. Photos should filter right away.
4. Tap a photo. It opens big, with the account, the issue it belongs to and the date.
5. Tap **Add photos**, pick one from the phone, choose the account, save. It should show at the top.
6. Tap **Add photos**, **From Google Drive**, paste a link to one photo. It is saved as a link.

Known limit: importing a whole Google Drive folder does not work yet. The Google Drive API is not switched on for the app's Google service account. That is a setting in Google Cloud that you would need to turn on.

---

## 2. Sub portal

**It is not live.** I skipped this step on purpose and here is why:

1. It needs changes to the **production database** and the **production settings**. Your standing rule is that I only do those with your typed approval. The overnight list was pasted, and your typed message ("merge everything once done") covers merging code, not this.
2. I also could not have done it from this computer: there is no production database connection here and no Neon login, and the safety guard refuses any database that is not the practice one.

**Backup branch:** not created. `pre-sub-portal-2026-10-09` does not exist.

What the new sub home needs in production (I checked the code):

| Needed | State in production |
| --- | --- |
| `DATA_SOURCE_SUB_PORTAL=postgres` | Already set |
| Migration `018_handoffs.sql` | Could not check, probably not applied |
| Migration `019_sub_home.sql` | Could not check, probably not applied |
| `FEATURE_SUB_HOME=1` | Not set |
| `FEATURE_HANDOFFS=1` | Not set. The sub home needs it today, because a sub's "extra job" request goes to the office "To process" list, which is part of Handoffs |

So turning the sub home on also turns on Handoffs (My work, To process, New accounts steps) for the office. That is a bigger change than one switch, and it is your decision.

To do it, from the office computer where you did the cutover:

1. In Neon, make a branch of production named `pre-sub-portal-2026-10-10`.
2. Apply migrations 018 and 019 to production.
3. In Vercel, Production only: add `FEATURE_HANDOFFS=1` and `FEATURE_SUB_HOME=1`. Redeploy.
4. Log in as one real sub and check the home screen, one photo upload and one extra-job request.

**To turn it off:** delete `FEATURE_SUB_HOME` (and `FEATURE_HANDOFFS` if you want Handoffs off too) in Vercel Production and redeploy. Subs go back to the old portal screen. No data is lost.

**What stays hidden either way:** the customer portal ("Portal open to customers" stays off).

---

## 3. Pin to board

- **Merged?** Yes. **Live now**, because `FEATURE_PIN_BOARD` was already on in production.
- **Preview link:** none. I did not set the Preview variables for this branch (that is a Vercel setting, which needs your typed OK). The branch's preview build is blocked on purpose until those exist, so no preview runs against the wrong data. I tested it here on the practice database instead: 13 of 13 steps passed.

### What the old commit already had

| Item from your list | Old commit | Now |
| --- | --- | --- |
| "Pin to board" button on to-do cards | Built, without the 📌 | Built, says "📌 Pin to board" |
| Same on complaints, supply orders, visits | Built | Built |
| Choose the square (Office or a person), default the assigned person | Built | Built |
| Shows "On the board" once pinned | Built as a label only | Built. Tap it to **Unpin** |
| Same on accounts | Not built | Built, in More on the account page. Off until you switch Accounts on in Settings, Pin Board |
| Same on account updates and New Account packet | Not built ("available after update") | **Not built.** They still live in Apps Script. See section 4 |
| Same on extra jobs | Not a button: an extra job pins itself as a blue paper | Same as before |
| Color by type | Built (yellow to-do, blue extra job, red complaint) | Same. No green "account update" note yet, since those cannot be pinned yet |
| Note shows title and account | Built | Built |
| Note shows who it is for and the due date | Not built | Built ("For Chris · Due Oct 12") |
| Red corner when overdue | Not built | Built |
| Green check when Done, drops off the next day | Not built | Built for to-dos |
| Tap opens the exact item | Partly (to-do opened the whole To-Do page) | Built. A to-do opens highlighted |
| Back arrow returns to the board, same spot | Not built | Built |
| TV mode: tap only zooms | Not built | Built. Not tested on a real TV link |
| Saved in Postgres with who and when | Built | Built |
| Behind `FEATURE_PIN_BOARD` | Built | Built |
| Notify the person when someone pins their to-do | Not built | **Not built.** It depends on board notifications, which you said not to start |
| Pin shown in the item's history | Not built | **Not built.** Unpins do show in the board's Done tray with who did it |

### One thing to know in production

The setting that chooses which kinds of record offer "Pin to board" is stored in a new column (migration `025_board_pin_types.sql`). I could not apply it to production. Until it is applied, production uses the default: **to-dos only**. Saving that setting will say the database is not ready. Nothing breaks. Apply 025 when you do the sub portal migrations.

### Phone test (on the live site)

1. Open **To-Do**. Each open to-do has **📌 Pin to board**.
2. Tap it, pick a square, tap Pin. The button becomes **📌 On the board**.
3. Open the **Board** on a computer (on a phone the Board opens "My square", which is a list). The yellow note shows who it is for and the due date. An overdue one has a red corner.
4. Tap the note. It opens that to-do, highlighted.
5. Tap the back arrow. You are back on the board at the same place.
6. On the to-do, tap **📌 On the board**, then **Unpin**. The note is gone and the Done tray says who unpinned it.
7. Mark a pinned to-do Done. Its note gets a green check and comes down the next day.

---

## 4. Apps Script

There is no `docs/apps-script/` folder in the project, so I could not read the Apps Script code itself. I worked from what the app sends and what Apps Script answers. That limits how far some pieces can go: where Apps Script writes an email, I cannot see its wording.

**Nothing was flipped in production. Apps Script was not edited, unpublished or turned off.**

### Every piece

| Piece | Status | Notes |
| --- | --- | --- |
| Account Updates: the list | **Rebuilt and merged, off** | Compared with the live Apps Script answer: 193 of 193 rows, 192 identical. One row shows Sep 28 where Apps Script shows Sep 29. The sheet has 9:57 pm on Sep 28 and Apps Script shifts it to the next day, so Postgres is the correct one |
| Account Updates: saving one | **Rebuilt and merged, off** | Tested here in dry run. Same id format (`UPD-` plus date and time) |
| Account Updates: the notice email | **Rebuilt and merged, off** | Sent by the app to the "notify" address. **Wording not compared**, because I cannot see Apps Script's wording and may not send a real one |
| New Account packet email | **Rebuilt and merged, off** | Sent by the app to the sub, with the same details the page sends. **Wording not compared**, same reason. If Apps Script attaches a file, this one does not |
| Sub Transfer Proposals (list, create, email, accept or decline) | **Not done** | The data is already copied to Postgres. Missing: the email wording, and how a sub's accept or decline gets recorded. I need the Apps Script code for that |
| Complaint and sub photos (upload to Google Drive, the Photos list) | **Not done** | The Google Drive API is not on for the app's Google service account, so the app cannot read or copy Drive files. Turn it on in Google Cloud and this can be built |
| Copy Drive photos into Blob | **Not done** | Same blocker |
| Old customer portal login and requests (`/customer-portal`) | **Not done** | Still passes everything to Apps Script. The new portal already runs without it |
| Editing a subcontractor | **Not done** | Adding a sub is on Postgres. Editing still goes to Apps Script |
| Sub portal login, sub activity log, sub issues | Already off Apps Script | With `DATA_SOURCE_SUB_PORTAL=postgres`, which is set in production |
| Accounts, subs list, complaints, visits, supplies, supply orders, notifications | Already off Apps Script | With their switches, which are set in production |

### What to flip in the morning

Only flip one at a time, and only after the step before it.

**A. Account Updates**

1. Refresh the copy in the production database right before flipping (updates typed since the last copy would otherwise be missing): run the accounts import against production the same way you did at cutover.
2. In Vercel, Production: add `DATA_SOURCE_ACCOUNT_UPDATES=postgres`. Redeploy.
3. Check: open Account Updates, the list should look the same. Add one update with your own email in "notify" and read the email that arrives.
4. **Rollback:** delete `DATA_SOURCE_ACCOUNT_UPDATES` and redeploy. The app reads the Sheet again. Any update saved while it was on is in Postgres only and would need to be re-typed. They are easy to find: their id starts with `UPD-` and they have no sheet row.

**B. New Account packet email**

1. In Vercel, Production: add `DATA_SOURCE_ACCOUNT_PACKET=postgres`. Redeploy.
2. Check: on a test account whose sub email is your own, tap Send packet and read the email. Compare it with an old packet email.
3. **Rollback:** delete `DATA_SOURCE_ACCOUNT_PACKET` and redeploy. Apps Script sends it again. Nothing to undo, since the packet saves no data.

I would hold B until you have seen the email. If the old packet had an attachment or wording you want kept, tell me and I will match it.

### What I need from you to finish the rest

1. The Apps Script code, pasted into `docs/apps-script/` (read-only copy). This unlocks Sub Transfer Proposals and exact email wording.
2. The Google Drive API switched on for the service account's Google Cloud project. This unlocks the photo pieces.
3. A typed OK for the sub portal step, or do the four steps in section 2 yourself.

---

## Practice database

Left clean. The test to-do pin, the test account update and its "to process" item were removed. The to-do I pinned was never changed.
