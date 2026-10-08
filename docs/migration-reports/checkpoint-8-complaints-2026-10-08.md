## Checkpoint Area 8 (Complaints) – 2026-10-08

Time: about 0.7 h actual vs 18 h estimate. Total so far: about 7.1 h vs 199 h estimated (areas 0, B, 1, 2, 3, 4a, 4b, 5, 6, 7, 8).

**New estimate.** 131 hours are still on the plan; at the measured pace that is about **5 to 14 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- The 22 complaints are now also in the practice database, each tied to its account.
- The app can read and save complaints from either place. The switch `DATA_SOURCE_COMPLAINTS` is **not set**, so the live app still uses Google Sheets and Apps Script.
- With the switch on, the complaint list, adding, closing and "Resend subcontractor email" no longer need Apps Script.
- New look on **Complaints** (list), the **complaint page** and **Add complaint**.
- **Print now works** on the complaint page, the Visits list and Account Health. Before, these printed a blank page.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| complaints (Complaints) | 22 | 22 | ✓ |

Every row compared field by field (22 × 17): 0 missing, 0 extra, 0 different. All 22 are linked to an account.

The complaint list Apps Script returns was rebuilt from the database and is **byte-identical** to the live answer (22 rows, 17 fields each). Over the web, the list from the database is byte-identical to what the app returns for the live answer (12,784 bytes).

Saves tested on Postgres: 18 function checks (add, IDs, link to the account, close, a stale row number, unknown complaint, the resend lookup). Through the web addresses with messages in dry-run: add (the two emails were logged, not sent), close, resend, unknown complaint. Test rows and their audit-log lines were removed.

Not tested:
- **A real text or email.** Everything ran in dry-run, as the rules require.
- **Uploading photos** with a new complaint (they go to Google Drive through Apps Script) and the follow-up To-Do it creates (Area 9).
- **Save changes on the complaint page.** On purpose: see finding 1.
- Whether Apps Script sends a message when a complaint is **closed**. Nothing suggests it does; the new version sends nothing on close.

### Found while doing this (worth your attention)
1. **"Save changes" on a complaint does not change it. It creates a second complaint.** The page sends an action the server does not know, so the server treats it as a new complaint: a new row is added, the original stays as it was, the office gets a "New Complaint Created" email again, and the screen says "Complaint updated successfully". I confirmed this on the practice database (messages in dry-run). The new database copies the same behavior until you say fix it. (Proposal 1.) **Until then, tell your team not to use Edit on a complaint.**
2. **The resolution note typed when closing a complaint is not saved anywhere.** The screen will not let you close without one, but the sheet has no place for it: 5 of the 16 closed complaints have no text at all. The new database keeps it in its own column from now on (still not shown, to match today). (Proposal 2.)
3. **The follow-up date on a complaint never shows.** It is saved in one column and read from another, so the "Follow-Up" column and box are always empty, even for the 11 complaints that have a date. (Proposal 3.)
4. **"Type" and "Subcontractor" are always empty** on complaints: the sheet has no column for either. The Add form's subcontractor is used only to send the text and email.
5. **Print printed a blank page** on several screens (complaint page, Visits list, Account Health). Fixed for these three as part of the new look; the accounts list still has it (Proposal 4).
6. Texts to the subcontractor on a new complaint only go out when the sub has a phone number on file; in my dry-run the email was logged and no text was attempted for that sub.

### Feature checklist: Complaints list
| Before | Now |
|---|---|
| "+ Add Complaint" | Blue **Add complaint** at the bottom |
| 6 number boxes | Same 6 |
| Search, Status, Account, Sort, From, To, Clear Filters in the page | Search + **Filter and sort** sheet with the same five; Clear filters |
| "X of Y" | Same |
| Cards on a phone, 12-column table on a wide screen; tap a row for the details pop-up | Same cards and 12 columns; an **Open** button opens the details sheet |
| Status, priority and validity as three colored badges | Status and priority as pills (color + word + icon); validity as a plain gray tag |
| Photo count | Same |
| Close button → pop-up asking for a resolution note | **Close complaint** → sheet with the same box and the same rule (a note is required) |
| Details pop-up with photos, Close Complaint, Dismiss | Details sheet with the same facts and photos, Close complaint, "Close this view" |

### Feature checklist: Complaint page
| Before | Now |
|---|---|
| Back to Complaints, Edit, Resend Subcontractor Email, Print | Back arrow; blue **Edit complaint**; **More → Resend subcontractor email, Print** |
| Date, account, type, three badges | Same, as title + pills |
| 11 facts in boxes, photos, Complaint ID | 8 facts + photos. The pills carry status, priority and validity; the Complaint ID line is gone |
| Editing turns the boxes into a form in place | The form opens in a sheet with the same 12 boxes (see finding 1 before using it) |
| Print: blank page | Print: the facts and photos, no buttons |

### Feature checklist: Add complaint
| Before | Now |
|---|---|
| Account search with a results list, "Selected … Change" | Same |
| Date, priority, status, validity, issue, reported by, manager, follow-up date, To-Do due date (moves with the complaint date until you touch it), notes | Same 11 boxes and choices |
| Photo picker (count, size limit, previews, Remove) | Same |
| The browser stops you when account, date, issue or manager is empty | Same |
| Save Complaint, Cancel | Blue **Save complaint**; back arrow |

50 screen checks in a headless browser at 375px and 1280px, all passed (two first-run misses were the test clicking hidden phone cards on the wide layout). Every screen and sheet measured: no sideways scroll, every button and box at least 48px, no text under 16px. Nothing was saved by the screen tests.

### Proposals awaiting approval (nothing here is built)
1. **Make Edit a real edit** (change the existing complaint, send nothing). Small, and it stops the duplicates. I recommend doing this first.
2. **Show the resolution note** on the complaint and in the list.
3. **Show the follow-up date** (read it from the column it is saved in).
4. Make Print work on the accounts list too.
5. Rename Complaints → Problems (still waiting from Part B), and the other earlier proposals.

### Decisions made without you
1. The Edit bug is copied, not fixed.
2. Closing a complaint on the new database changes Status and Updated At, keeps the resolution text in a new column, and sends nothing.
3. "Resend subcontractor email" on the new database is sent by the app itself: the same "New Complaint" email it sends on creation, to the subcontractor named on the complaint's account. (Apps Script cannot see complaints that live only in the database, and its own wording is not in the project.)
4. Print was made to work on three screens (it printed blank pages).
5. Validity shows as a gray tag instead of a colored badge: "Valid" in red next to a red "Open" read as two alarms.
6. The Complaint ID line was removed from the complaint page.
7. Lint went from 17 to 16 problems (one old warning disappeared with the rewritten list). 16 is the new baseline.

### Protected files edited
None in this area.

### Readers still on Sheets / Apps Script
- Complaint photos: upload and list go through Apps Script and Google Drive.
- The subcontractor performance score reads the Complaints, Visits, Accounts and Subcontractors tabs directly. All four are now in the database; moving the score is listed for the wrap-up area.
- The sub portal ("Resolved by Sub") and the customer portal ("portal-complaints") are their own areas (13 and 11).
- **Do not turn `DATA_SOURCE_COMPLAINTS` on in production before those are done.**

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Complaints**. Six number boxes and a card per complaint with a colored status.
2. Tap **Filter and sort**, set Status to "Open", tap **Done**. Only open complaints, and the button says "(1 on)". Tap **Clear filters**.
3. Tap **Open** on a card. The facts and photos slide up. Tap **Close this view**.
4. Tap **Close complaint** on an open one. A sheet asks for a resolution note. Tap **Cancel**.
5. Open a complaint's own page (from a text link, or `/complaints/` + its ID). Tap **More → Print**: the preview should show the facts, not a blank page.
6. **Do not use Edit complaint → Save changes** (finding 1).

### How to undo
Data: leave `DATA_SOURCE_COMPLAINTS` unset (it is). Screens: revert "migration(complaints): step 5 …". Everything: revert the commits whose message starts with `migration(complaints)`.
