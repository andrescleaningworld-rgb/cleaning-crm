## Checkpoint Area 15 (Wrap-up) and end of the plan – 2026-10-08

Time: about 0.5 h actual vs 7 h estimate. **Total: about 11.2 h of Claude Code work vs 237 h estimated.** All 15 areas of the plan are done on branch `migration/postgres`.

### Where things stand
- **Production is unchanged.** It still reads and writes Google Sheets and Apps Script. No switch is on. Nothing was merged, deployed, or written to Sheets, Apps Script or the production database.
- **The practice database holds a full, current copy.** I ran every area's verify once more at the end, against the live sheets: **all 33 tables match, row for row and field for field** (2,707 sheet rows; 0 missing, 0 extra, 0 different).
- **Every area has a Postgres path behind its own switch**, and every screen has the new look. What is left is yours: read the reports, try the previews, and decide if and when to switch. The steps are in `docs/CUTOVER_RUNBOOK.md`.

### What this area did
1. **Moved the last direct Sheets reader.** The subcontractor performance score read four tabs straight from Sheets. It now follows the switches (it uses Postgres when Subcontractors, Accounts, Visits and Complaints are all on). The scoring rules were not copied: both sides run the same code on the same rows. Check: 38 of 38 subcontractors get identical scores.
2. **Foreign keys.** 17 links worked out at import (row → account, row → subcontractor) are now real database links on the practice database. None pointed at nothing. Deleting an account or sub un-links its rows; it never deletes them. All ten areas' save checks were run again afterwards and pass.
3. **`docs/DATA_MODEL.md`**: every table, where it came from, its columns, links and row count. Regenerate with `node scripts/migrate/data-model.mjs`.
4. **`docs/CUTOVER_RUNBOOK.md`**: rehearsal, the switch, what to do if it goes wrong, what stays on Apps Script, which tabs become frozen archives.

Not tested:
- **The performance score over the web** on both sources. The comparison was done on the function's result.
- **Anything in the runbook against production.** By rule I never touched it. The first real run is the rehearsal on a preview.

### Found while doing this (worth your attention)
1. **A visit with no condition score counts as a score of 0** in a subcontractor's "average condition" when the visit row has anything filled in after that column (a note, a follow-up). It drags the average down for 11 subcontractors today. Same on both sources: I copied it exactly, because fixing it changes the numbers you see. (Proposal 1.)
2. **Switching one area at a time is riskier than the plan assumed.** Many screens read accounts while they work. An area left on Sheets would read the Accounts tab, which stops changing once Accounts is on Postgres. The runbook recommends two stages: three independent areas first, then the other ten together.
3. **A rollback after switching is one-way.** Turning a switch off sends the app back to Sheets, but whatever was saved in Postgres in between is not in Sheets. Nothing in this work writes to Sheets, by rule.
4. **Six things stay on Apps Script** (Account Updates, Sub Transfer Proposals, the New Account packet email, Photos, the older customer portal's requests, one unused address). Their source is not in the repo. Apps Script and the Google service account must stay configured after the cutover.
5. **Preview deployments:** I could never confirm which database a Vercel preview uses. Check that before the rehearsal (runbook, Part 2, step 3).

### Slips in this session (so you know how far to trust the checks)
- Twice my measuring tool passed a screen that was visibly broken (quick-action cards in Area 11, the Login choices in Area 14). Both were caught by looking at a screenshot, fixed, and the pattern was then searched for across all screens. Measuring proves sizes and overflow; it does not prove a screen looks right. **The phone click-throughs in each report are worth doing.**
- I printed one account name to my console while checking the sub portal issue list (Area 13). It went nowhere else.
- Earlier slips are in the area reports (a quota burst in Area 7, the cut-off check added late in Area 10).

### The numbers
| | |
|---|---|
| Areas done | 15 of 15 |
| Tables from Sheets | 34 (2,778 rows on the practice database) |
| Migration files | 16 |
| Import + verify scripts | 13 + 13 |
| Switches | 13, none on |
| Open questions in the data | 137 (none blocks a switch; each questioned row works as text and is only not linked) |
| Checkpoint reports | 17 earlier reports + this one |
| Lint | 16 problems (10 errors, 6 warnings), all older than this work; none added |

### Proposals awaiting approval (nothing here is built)
1. Leave a visit with no condition score out of the average.
2. Everything listed in the earlier reports. The ones that matter most: a real login for the sub portal and for the older customer portal; random portal codes; the complaint "Save changes" fix; the customer portal's empty visit calendar; stock tracking for supplies.
3. Move the six Apps Script leftovers, once their source is available.

### Decisions made without you (this area)
1. The scoring code was split in two inside `lib/googleSheets.ts` so both sources share it. No rule changed.
2. Foreign keys are `ON DELETE SET NULL`: a link is a help, not a requirement.
3. The three keys to Staff were left out until People is on in production (a new staff member saved in Sheets would be blocked otherwise).
4. The runbook recommends two stages instead of thirteen.

All decisions from all areas are in `docs/MIGRATION_PLAN.md` → PROGRESS → "Decisions made without Andres", each with how to change it.

### What I would do next, in order
1. Read the "Read this first" sections of the Area 11 and Area 13 reports (customer and subcontractor logins).
2. Open a preview of the branch with no switch set and do the phone click-throughs.
3. Open a preview with all switches on and `OUTBOUND_DRY_RUN=1`; log in as one real sub and one real customer.
4. Then decide about merging, and separately about switching.
