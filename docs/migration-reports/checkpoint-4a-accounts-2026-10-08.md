## Checkpoint Area 4a (Accounts core) – 2026-10-08

Time: about 1.6 h actual vs 34 h estimate. Total so far: about 3.6 h vs 101 h estimated (areas 0, B, 1, 2, 3, 4a).

**New estimate.** Six parts done at roughly 4% of the estimated hours. 229 hours are still on the plan; at the measured pace that is about **9 to 25 hours of Claude Code work**. Your own part (answering questions, clicking through each area) has not shrunk. Deadline: not set.

### What changed (plain words)
- All 399 accounts, the 3 onboarding checklists, the 193 account updates and the 72 transfer-proposal rows are now also in the practice database.
- The app can read and save accounts from either place. The switch `DATA_SOURCE_ACCOUNTS` is **not set**, so the live app still uses Google Sheets and Apps Script.
- With the switch on, adding an account, changing one, changing its status and the onboarding checklist all work without Apps Script.
- Your answer "that name is me" is recorded: 387 of 396 accounts now have a linked manager (was 242).
- New look on five screens: **Accounts** (list), **Add account**, **Edit account**, the **account page**, and the **transfer proposal builder** inside the list.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| accounts (Accounts) | 399 | 399 | ✓ |
| onboarding_checklists (OnboardingChecklist) | 3 | 3 | ✓ |
| account_updates (Account Updates) | 193 | 193 | ✓ |
| sub_transfer_proposals (Sub Transfer Proposals) | 72 | 72 | ✓ |

Every row compared field by field: 0 missing, 0 extra, 0 different; the revenue sum and the proposed-pay sum are equal. Parity: 11 direct reads, 11 identical. The account lists Apps Script returns were rebuilt from Postgres and compared with the live answers: `getAccounts` 397 of 397 rows and `getMapAccounts` 370 of 370 rows identical on every field. Five web addresses returned byte-identical answers on both sources.

Saves tested on Postgres: 31 function checks, plus add, partial save and full save through the web address and through the screens. The practice database was re-imported afterwards and matches Sheets again.

Not tested:
- **Portal access = Yes** on any screen. It writes to the real customer-portal sheet. A new safety switch (`SHEETS_READ_ONLY=1`) now makes that impossible on this computer.
- **Save draft / Send email** on a transfer proposal, **Send new account packet**, creating to-dos from the list. They write to Apps Script or Sheets.
- Google address suggestions (no Maps key on this computer) and the PDF download.
- `getAllAccounts` in full: Apps Script answered "Page Not Found" 4 times out of 6 on Oct 8 between 07:10 and 07:25. Its one extra field (cancelled date) was checked by format only. **Please check that the live Accounts screen loads for you.**

### Found while doing this (worth your attention)
1. **The Accounts sheet has 443 blank rows between real ones** (399 accounts on 842 rows), and Account Updates has 848. Nothing breaks, but it is why some lists are slow.
2. **One account row has no Account ID** (sheet row 843) and two have no name. Imported as they are.
3. **Account Updates: the Update ID and Account ID are formulas filled in for only about 20% of rows.** Updates are tied to accounts by exact name instead: 183 of 193.
4. **Apps Script rewrites the whole row on every save**, which turns "$1,560" into "1560" in columns nobody touched. The Postgres version writes only what changed.
5. **Adding an account with Portal access = Yes writes straight to the customer-portal sheet**, with no confirmation. Worth knowing before anyone tests on the live site.

### Questions for you (data)
1. **Leo / Anvil Clean**: your answer came through as "SUB-___" with the number missing. Which one is real, SUB-004 or SUB-037? Nothing is merged or deleted either way.
2. **9 accounts still have no linked manager**: the cell holds two names, or a spelling with an accent that matches nobody. Left unlinked.
3. **3 accounts name a subcontractor that matches no sub.** They already show under no sub in the app today.
4. **10 account updates and 6 proposal rows** name an account that no longer exists under that exact name. Left unlinked.
5. The 25 questions from the import are in the practice database (`migration_issues`); the ones above are the groups they fall into.

### Feature checklist: Accounts list
| Before | Now |
|---|---|
| Row of buttons: Transfer Proposal, Create To-Dos for Multiple, Print Sub Account List, Print, Add New Account | Blue **Add account** at the bottom; the other four in **More** |
| Search box + Search button; loads the default view on arrival | Same |
| 10 filter and sort controls in the page | **Filter and sort** button → sheet with the same 10; the button shows how many are on |
| Clear Filters (empties the list and shows the start message) | Same |
| 7 number tiles | Same 7 |
| "Showing X of Y", Near Account warnings | Same |
| Table with 6 columns | Cards on a phone; the same 6 columns on a wide screen |
| Status and health badges by color | Color + word + icon |
| "ID: ACCT-…" under each name | Gone (no raw IDs); still in the address bar and in Full account info |
| Change Status, + To-Do per row; pop-ups | Same two buttons; they open sheets with the same boxes |
| Multi to-do mode with tick boxes and its form | Same |
| Load More (15) | **Show 15 more** |

### Feature checklist: Transfer proposal builder
| Before | Now |
|---|---|
| Opens from the Transfer Proposal button and hides the list | Opens from **More → Transfer proposal**; same |
| Clear Proposal | Same |
| Left: Current Subcontractor, Search Accounts, "X selected, showing N of M", up to 25 accounts with tick boxes | Same |
| Right: New Subcontractor (existing or + Add New with name and email) | Same |
| Selected Accounts + total proposed pay; Proposal ID box | Same two tiles; the second says "Saved" or "Not saved yet" with the ID under it |
| Each selected account: address, days, keys/alarm Yes or No, scope, Proposed Monthly Pay, Remove | Same |
| Notes | Same |
| Buttons: Cancel, Save Draft, Print Proposal, Send Email | Same four |
| Stored Transfer Proposals table with Refresh and 7 columns | **Drafts and old proposals**: cards on a phone, the same 7 columns on a wide screen |
| "View" on a stored proposal → 3 number tiles, notes, account list, Close View | **Open** → same |
| Status colors: accepted green, sent blue, declined / cancelled red, draft amber | Accepted green, declined / cancelled red, **sent and draft both amber** ("waiting"); each with its word and icon |

### Feature checklist: Add account, Edit account, Account page
| Screen | Before | Now |
|---|---|---|
| Add account | 22 boxes in 5 sections; address suggestions; nearest-sub suggestion; pay suggested at 70% of revenue; Portal access row | Same boxes, same sections, same extras, same request |
| Edit account | 24 boxes in 7 sections; 4 number tiles; Crew Link switches; saves only what changed | Same |
| Account page | Status + health badges, 5 tiles, Account Snapshot (10 facts), Notes, onboarding checklist and its editor, History, print packet | Same |
| Account page buttons | 11 buttons in rows | Blue **Edit account**; **Add visit / Add complaint / Add update** in a row; the other 7 in **More** (Change status, Portal access ON/OFF, Print PDF, Send new account packet, Onboarding checklist, Add sale, Full account info) |
| Account page pop-ups (3) | Pop-ups | Sheets with the same boxes |

Screen checks in a headless browser at 375px and 1280px: Add account 10 of 13, Edit 14 of 14, account page 18 of 18, list 25 of 25, transfer builder 38 of 38. Every miss was a wrong expectation in the test, not the screen. Screenshots are **not** saved in the repo because they show real customer names and money.

### Proposals awaiting approval (nothing here is built)
1. Remove the blank rows from the Accounts and Account Updates sheets (you would do this, not me).
2. Always calculate Gross Margin and Gross Margin % when an account is saved (today only some rows have them and no screen reads them).
3. Ask "Are you sure?" before turning Portal access on.
4. Paste the Apps Script source (`.gs` files) into `docs/apps-script/`, so Account Updates, transfer proposals and the new-account packet can move off Apps Script without guessing the email wording.
5. Still waiting from earlier: Complaints → Problems and the other name changes; merging Staff and Managers; the 5 never-saved boxes on Add subcontractor; blank Status = Active.

### Decisions made without you
1. Account Updates and Sub Transfer Proposals stay on Apps Script even with the switch on. Saving one sends an email whose wording lives only in Apps Script.
2. "Send new account packet" stays on Apps Script on both sources, for the same reason.
3. On Postgres a save writes only the changed fields.
4. New accounts on Postgres get an ID in the same form as today (`ACCT-` + date and time) and Last Updated stamped.
5. Accounts with no ID or no name were imported as they are; nothing dropped.
6. Managers and subs are linked by exact match only, never guessed.
7. The "ID: …" line was removed from the list.
8. "Sent" proposals show amber instead of blue: the new kit has one color for "waiting on someone".
9. The Accounts list stays one file. Splitting it into smaller files changes nothing you can see and is safer done once, when no other screen work touches it.
10. Texting a sub on Postgres uses the normal Phone column first, then the far-right one (your answer 3).

### Protected files edited
None in this area.

### Readers still on Sheets / Apps Script
- Account Updates, transfer proposals, the new-account packet (Apps Script, see above).
- Portal access on/off (customer-portal sheet, Area 11).
- To-dos created from the list (Area 9).
- Inside `lib/googleSheets.ts` other areas still read the Accounts tab directly: the sub performance score, the customer-portal account merge, To-Do, Complaints and Visits lookups (Areas 6–11).
- **Do not turn `DATA_SOURCE_ACCOUNTS` on in production before Areas 11 and 13 are done.**

### Slips (mine)
- Three commits (steps 1–3) were pushed while the type check was failing in one script. Fixed in the next commit; the check result is now read before the commit is made.

### Click-through test on your phone
On a Vercel preview of this branch (see the preview-database warning in the Checkpoint 0 report):
1. Open **Accounts**. You should see 15 cards of active accounts and 7 number boxes.
2. Type "dental", tap **Search**. Fewer cards. Tap the ✕ in the box and **Search** again.
3. Tap **Filter and sort**, set Status to "Cancelled", tap **Done**. The button should say "(1 on)" and every card should say Cancelled. Tap **Clear filters**, then **Search**.
4. Tap a name. You should see the account page: two colored words, 5 number boxes, the snapshot.
5. Tap **More**. You should see 7 choices. Tap outside to close. **Do not tap Portal access.**
6. Tap **Edit account**. The form opens filled in. Go back without saving.
7. Back on the list: **More → Transfer proposal**. Pick a current subcontractor, tick one account. "1 selected" and a pay box should appear. Tap **Cancel**. **Do not tap Save draft or Send email.**

### How to undo
Data: leave `DATA_SOURCE_ACCOUNTS` unset (it is). Screens: revert the five commits whose message starts with `migration(accounts): step 5`. Everything: revert the commits whose message starts with `migration(accounts)`.
