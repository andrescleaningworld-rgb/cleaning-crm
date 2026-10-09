## Checkpoint Area 14 (Shell and the remaining screens) – 2026-10-08

Time: about 0.5 h actual vs 12 h estimate. Total so far: about 10.7 h vs 237 h estimated (areas 0, B, 1 through 14).

**New estimate.** 7 hours are still on the plan (Wrap-up); at the measured pace that is **under 1 hour of Claude Code work**. Deadline: not set.

### What changed (plain words)
This area moves no data. It gives the kit look to the screens no earlier area owned:
- **The blue header on every page.** Links and the Logout button are now full-size (48px, 16px text). On a phone the links fold behind one **Menu** button, so the header no longer fills the screen; on a wide screen the menu is always open, as before. Every link is still there.
- **Dashboard (home), Help, Settings, Settings → Logs, Settings → Activity Log, Follow-ups, Equipment Categories, Crew Link (staff page), Crew Link checklist submissions, the sub's equipment page, and the three-way Login page.** Same content in the same order, with kit boxes, buttons, fields and text sizes.

### Checks
Measured in a headless browser at 375px and 1280px: Dashboard, Help, Settings, Logs, Activity Log, Follow-ups, Equipment Categories, checklist submissions, Crew Link, Login (without a session), and the header with the staff menu and with the customer menu. No sideways scroll, nothing cut off, every button and link at least 48px, no text under 16px. The phone menu was clicked: it opens, a tap on a link goes there and closes it, and on a wide screen the button is gone and the links show.

**All earlier screens were measured again** with the cut-off check I added in Area 10 (the one I owed from that report): Accounts, Accounts Center, Account Updates, Account Health, Subcontractors, Sub Center, Equipment, Sub Schedules, Visits, Complaints, To-Do, Documents, Extra Services, Sales, Reports, Supplies, Supply Orders, Portal Requests, Settings → Portal, Notifications, Map. All pass. The only text under 16px anywhere is the map's own credit line ("Leaflet | © OpenStreetMap"), which comes from the map library.

Not tested:
- **Nothing was saved or clicked on these screens** beyond the header menu. They were opened and measured. The pages changed in class names only (plus the header's menu button), so their buttons call the same code as before, but I did not press them.
- **A real staff login.** The login page was opened and measured; no name or password was typed.
- **The sub's equipment page** (`/subcontractor-portal/equipment`): it needs a sub session; it was restyled and compiles, not opened.

### Found while doing this (worth your attention)
1. **My measuring passed a broken screen again.** The three choices on the Login page (Admin, Subcontractor, Customer) came out squeezed into narrow columns after the scripted pass. The numbers were fine (nothing cut off, big enough targets); only a screenshot showed it. Same pattern as the two quick-action cards in Area 11. I then searched every screen for that pattern: it existed only in files from this area (Login, Dashboard, Settings, Crew Link, checklist submissions: 12 places), all fixed and looked at.
2. The header is taller than before on a wide screen (about 270px with the staff menu), because the links are bigger. If that is too much, a single-row menu with "More" is the next step. (Proposal 1.)
3. The Activity Log keeps its owner-only rule: I did not touch `proxy.ts` or the page's access code.

### Feature checklist
| Screen | Before | Now |
|---|---|---|
| Header | Logo, title, help "?", links by role (staff 11 incl. Notifications and Portal with counts, sub, customer), Logout | Same links. Phone: one Menu button (with the count of new items) that opens them |
| Login | Three choices, then the staff name picker and password (protected) | Same; class names only |
| Dashboard | Command center cards, counts, lists | Same |
| Help | English / Español, the guide sections | Same |
| Settings | The five links, the option lists (managers, visit types, and the rest) with add / edit / remove | Same |
| Logs, Activity Log | Filters and list; Activity Log owner-only | Same |
| Follow-ups, Equipment Categories, Crew Link, checklist submissions | – | Same |

Left as they are, on purpose:
- **Team Hub** screens and code (rule 14).
- **Crew Link's porter page** and the **equipment-check** page that crews open from a link: they have their own large-text design for the field.
- All **print** pages.

### Proposals awaiting approval (nothing here is built)
1. A one-row header with the five most used links and "More".
2. Dashboard and Settings rearranged around one main action each (they are restyled in place).
3. Everything still waiting from earlier reports.

### Decisions made without you
1. **The phone menu button.** It changes the layout of the header on phones (one extra tap to see the links). Nothing was removed. Undo: the menu button and the `hidden` / `sm:flex` classes in `app/components/CWHeader.tsx`.
2. These screens were restyled in place, not rearranged.
3. The porter page, the equipment-check page and Team Hub were not restyled.

### Protected files edited
- `app/login/page.tsx`: class names only. No logic, no field, no request changed.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open the app. The header shows **Menu**. Tap it: all the links appear, big enough to tap. Tap **Settings**: you land on Settings and the menu is closed again.
2. Log out. The Login page shows three boxes, one under the other, each with its own button.
3. Open **Help**, **Follow-ups** and **Settings → Logs**: text is larger, nothing is cut off.
4. On a computer: the header links are all visible without a Menu button.

### How to undo
Revert "migration(shell): step 5 …".
