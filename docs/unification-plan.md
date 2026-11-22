# One Simple System: Unification Plan

Written November 22, 2026, from the code on `main` at commit `e49ae54`.
This is a plan only. No code, database, or setting was changed.

## The short version

**Everyone gets one place to look.**

| Who | Where they look | What they do there |
|---|---|---|
| Office | **Pin Board** | See all work, assign it, finish it |
| Subs | **Sub Portal** | See their work, tap Done, report a problem, order supplies |
| Crews | **CW Now** | Do the checklist, send photos, report a problem, order supplies |
| Customers | **Customer Portal** | No change |

**Behind those screens, there is one task engine.** The new CW Now to-do is already the best version of it, so we grow it instead of building a new one.

- **Stays:** Pin Board, CW Now, Sub Portal, Customer Portal, Complaints, Supply Orders, Extra Jobs.
- **Merges:** To-Do goes into the Pin Board. Every problem report shows on the Pin Board.
- **Removed, after checks:** the To-Do page (old links keep working) and Team Hub (if no crew still uses it).

## What I could not check

- **Live data.** I did not connect to the production database, so I have no real counts. Section 7 has a read-only query to run first.
- **Production settings.** The local env files do not hold the production switches (`FEATURE_PIN_BOARD`, `TEXT_LINKS_ALLOWED`, `DATA_SOURCE_*`). I also cannot tell whether migration 087 has been run in production.
- **Real usage.** Code shows what *can* happen, not what people do each day. Team Hub is the main unknown.
- **Branch name.** `feature/cw-now-todos` does not exist in this repo. That work is already on `main`.

---

## 1. What each one does today

### Pin Board (`/board`, `/board/tv`)

- The staff home page and the office TV.
- Has a square per manager, plus shared boxes: new accounts, extra jobs, complaints, supplies, Office.
- **Pins itself** for open complaints, supply orders, extra jobs, and new accounts (with the pizza tracker).
- People can add sticky notes, or pin a to-do, visit, account, update, order, or report.
- Red pin means new. "Got it" turns it green. Done moves it to the Done tray, then the Archive.
- Asks for a status after 2 business days of silence. The third unanswered ask tells the owner.
- Texts a manager when someone else puts a pin in their square.
- Also has an office calendar (holidays, birthdays, and so on).
- **Tables:** `handoff_items` (each pin), `board_settings`, `board_status_log`, `board_tv_links`, `cleaning_marks`.

### To-Do (`/to-do`)

- The office task list, assigned to a manager **by name**.
- Has things the board does not: bulk edit, assign to many accounts at once, Low/Medium/High priority, outcome notes, printed sheets, and a "finish this visit" form.
- Creates, moves, and closes events on the Google Calendar `cleaningworldoperations@gmail.com`. The calendar never writes back.
- Texts and pushes the manager when assigned, at 8 AM on the due day, and 1 hour before a timed to-do.
- **New accounts depend on it.** Survey, walkthrough, first cleaning, and follow-up are all to-dos.
- The Overview page counts it.
- **Tables:** `todos`, `todo_sms_log`. **Careful:** `todo_sms_log` is really the log for *all* texts, including the board and CW Now.

### CW Now, formerly Crew Link (`/porter/[code]`, office page `/crew-link`)

- A no-login link per account for crews, in English, Spanish, and Portuguese.
- Checklists, photo checklists and work reports, photos, supply orders, supplies arrived, problem reports, documents.
- **Sub to-dos** (`/porter/task/<token>`): a private link per task with Done, note, photo, and add-to-phone-calendar. Tracks Needs link → Sent → Seen → Done. Has Google Calendar and reminders.
- **Tables:** `checklist_templates`, `checklist_tabs`, `checklist_submissions`, `crew_link_people`, `cw_now_tasks`, `cw_now_task_files`, `cw_now_task_events`. Its problems and orders go in Team Hub's tables (`hub_issues`, `hub_photos`, `supply_orders`).

### Subcontractor Portal (`/subcontractor-portal`) (protected page)

- Login for subs. A simple home screen, with a "More" area behind it.
- Accounts, complaints (Got it, fixed with photo), problem reports, supply orders, supplies arrived, schedule and calendar, insurance, documents, job offers, time on site, site photos, equipment.
- **It does not show CW Now to-dos today.** A sub only reaches a task through its private link.
- **Tables:** `sub_portal_issues`, `sub_supply_orders`, `sub_site_photos`, plus shared account and complaint tables.

### Two more that overlap (not on your list)

- **Team Hub** (`/team-hub/[token]`): the older crew link with a worker PIN. Checklist, rounds, and problem reports. Its supply ordering was already removed. It overlaps CW Now almost completely.
- **Handoffs** (`handoff_items`): the table under the Pin Board. It is already close to a universal "work card", which is why this plan is smaller than it could have been.

---

## 2. Where they do the same job

| Job | Pin Board | To-Do | CW Now | Sub Portal | Team Hub | Problem today |
|---|---|---|---|---|---|---|
| **Assign a task** | Sticky note, or to-do pin | Yes | Sub to-do | Cannot see them | No | 3 kinds of task |
| **Mark done** | Done on pin | Status | Done on link | No | No | **Pin and to-do can disagree (bug A)** |
| **Reassign** | Drag to a square | Edit | No | No | No | **Drag does not reassign (bug B)** |
| **Send a text** | On landing in a square | On assign | To the sub | Complaint notices | No | Same sender, separate wording and rules |
| **Reminders** | Status asks | 8 AM, 1 hour | Day before, due morning | No | Checklist alerts | 4 sets of rules |
| **Calendar** | Own office calendar | Syncs to Google | Syncs to Google | Own schedule | No | Sticky notes with a due date never reach it |
| **Report a problem** | Does not show them | No | `hub_issues` | `sub_portal_issues` | `hub_issues` | **Different inboxes, none on the board** |
| **Order supplies** | Shows them | No | `supply_orders` | `sub_supply_orders` | Removed | 2 tables, but already one office inbox |
| **Upload photos** | No | No | `photo_index`, `hub_photos`, task files | `sub_site_photos`, complaint photos | `hub_photos` | Many tables, mostly gathered on the Photos page |
| **Checklists** | No | No | Yes | Read view | Yes | 2 systems |
| **Status history** | `board_status_log` | Notes only | `cw_now_task_events` | No | No | 3 histories |

### Where a problem report lands today

| Reported by | Saved in | Office finds it in | On the Pin Board? |
|---|---|---|---|
| Customer complaint | `complaints` | Complaints | **Yes** |
| Customer request | `portal_requests` | Portal Requests | No |
| Crew (CW Now) | `hub_issues` | Email, Accounts Center queue, account tab | No |
| Crew (Team Hub) | `hub_issues` | Same | No |
| Sub | `sub_portal_issues` | Email, Notifications | No |
| Equipment (tablet) | `equipment_reports` | Equipment | No |

This is the main reason people don't know where to look.

### Bugs found while reading (not fixed)

- **Bug A: Done on a to-do's pin does not finish the to-do.** Only the pin comes down. The to-do stays open, its calendar event stays open, and the manager still gets its reminders.
- **Bug B: dragging a to-do's pin to another manager does not reassign it.** The new manager gets a text and the pin, but the to-do and all its reminders stay with the old manager. The pin keeps the old name.
- **Bug C: Team Hub's missed-checklist alert is not scheduled.** The job exists, but it is not in `vercel.json`, so it does not run by itself.
- **Bug D: the Notifications badge still needs `GOOGLE_SCRIPT_URL`.** It returns an error without that setting, even when the data is in Postgres. Fix this before ever removing Apps Script.

---

## 3. The one unified setup

### Three simple rules

1. **Every piece of work is one card.** It has who, which account, what, when, and a status.
2. **The office sees every card on the Pin Board.**
3. **Subs and crews see only their own cards, on their one screen.**

### The pieces

```text
   WHO ASKS                 ONE ENGINE                  WHO SEES IT
 ------------         ----------------------        -----------------
  Office       --->    Tasks (one table)     --->    Office: Pin Board
  Customer     --->    Complaints            --->    Subs: Sub Portal
  Crew         --->    Supply orders         --->    Crews: CW Now
  Sub          --->    Extra jobs            --->    Customer: Portal
                       Problem reports               (their own only)
                              |
                 One notifier: text, push, email
                 One calendar sync
                 One file store
```

- **Tasks:** grow `cw_now_tasks` so a task can belong to a **manager or a sub**. It already has status, history, files, translations, calendar, and reminders.
- **Complaints, supply orders, extra jobs:** **keep their own tables.** They have real rules (response clock, stock counts, invoicing). The board already mirrors them, and that pattern works.
- **Pins:** stay as they are. A pin is the card's picture on the board.
- **Notifier:** one helper decides who gets what. Wording stays the same.

### What stays, merges, and goes

| Thing | Decision | What people notice |
|---|---|---|
| Pin Board | **Stays**, becomes the one office view | Gains a List view |
| To-Do page | **Merges** into the board, then retired | "To-Do" leaves the menu, old links still open |
| To-Do data | **Moves** into Tasks | Nothing, if done right |
| Sticky notes | **Stay** for quick notes | A note with a due date can become a task |
| CW Now | **Stays** as the crew screen | Nothing |
| CW Now sub to-dos | **Become** the Tasks engine | Nothing |
| Sub Portal | **Stays** | New "My to-dos" tile |
| Crew and sub problem reports | **Stay** in their tables, **show on the board** | Office finally sees them in one place |
| Notifications page | **Retired later**, once the board shows the same items | One less page |
| Portal Requests | **Stays**, and also pins to the board | Customer sees no change |
| Supply Orders | **Stays**, already one inbox | Nothing |
| Team Hub | **Removed** if nobody uses it | Nothing, if the check is right |
| Customer Portal | **Not touched** | Nothing |

### What I recommend we do not do

- **Do not merge everything into one giant table.** Complaints and supplies would lose their rules, and it is the riskiest possible move.
- **Do not merge the two supply order tables now.** The office already has one inbox, so the risk buys almost nothing.

---

## 4. Data that needs moving

| Data | Move | How | Risk |
|---|---|---|---|
| Open to-dos | **Yes** | Copy to Tasks, keeping the old ID | Medium |
| Finished to-dos | **Copy or keep read-only** (question 6) | Overview's weekly counts need them | Low |
| To-do calendar event IDs | **Yes, exactly** | Copy the ID, never make a new event | **High if wrong** |
| To-do reminder marks | **Yes** | Copy, so nobody gets a repeat text | Medium |
| New-account step links (`flow_key`) | **Yes** | Copy, and switch `flow-todos.ts` in the same release | **High if wrong** |
| To-do pins | **Yes** | Point each pin at its task | Medium |
| Text log (`todo_sms_log`) | **No** | Keep the table and its name | None |
| Problem reports | **No** | Only pinned to the board | Low |
| Supply orders, complaints, extra jobs | **No** | Unchanged | None |
| Photos | **No** | Unchanged | None |
| Team Hub data | **No** | Keep the tables after the screens go | None |

The old `todos` table is **kept, read-only, for at least 90 days**, as the way back.

---

## 5. Risks and how we protect against them

| Risk | What could go wrong | Protection |
|---|---|---|
| **Daily use** | Office loses its To-Do list mid-week | Board List view ships *first*. Both work side by side until you say go |
| **Google Calendar** | Duplicate or lost events | Carry event IDs over. Test on the practice database. Compare event counts before and after. Never bulk re-create |
| **Texts** | Repeat reminders, or a flood when old items pin | Copy reminder marks. Only pin problems created *after* go-live. Run the first test with outbound dry-run on |
| **Text credit** | More pins means more paid texts | Problem pins can start with no text. Watch the Textbelt credit banner |
| **Links in texts** | Textbelt blocks links until the account is verified | The "My to-dos" tile lets subs see tasks without a link |
| **New accounts** | Survey or walkthrough steps break | Move `flow-todos.ts` in the same release, and run one full test account |
| **Old links** | Texts, calendar events, and bookmarks point to `/to-do?id=...` | Permanent redirect to the same card on the board. 23 files mention `/to-do` today |
| **Customer portal** | A crew's private note or problem photo reaches a customer | No phase changes customer pages. Problem photos stay hidden from customers. Task files stay private |
| **Customer wording** | The word "sub" reaches a customer | Any new customer text says "team". Check customer emails and pages in each phase |
| **Protected files** | Accidental edits | See below |
| **No preview builds** | `vercel.json` skips every non-production build, so nothing can be tried on a preview URL | Test locally on the practice database, or turn previews on for this project |
| **Rollback** | A phase goes wrong | Each phase has its own switch or simple revert. Migrations only add |

### Protected files

- **`app/subcontractor-portal/page.tsx`: no phase needs to change it.** The "My to-dos" tile goes in `simple-home.tsx` and its API. Problem pins are added on the server.
- **`app/visits/page.tsx`: no phase needs to change it.**
- **Flag:** the To-Do page's "finish this visit" form must keep working when it moves to the board. It moves with its current save path, without touching the Visits page. If that turns out to be impossible, I will stop and ask you first.

---

## 6. The phases, in order

Each phase ships alone and leaves the app working. You can stop after any of them and still be better off.

### Phase 0: Measure (read-only, about 1 hour)
Run the query in section 7 and answer the questions in section 8.
**Done when:** we know the real numbers and whether Team Hub is in use.

### Phase 1: Fix the pin and to-do bugs (small, no migration)
- Done on a to-do's pin finishes the to-do, its calendar event, and its reminders.
- Dragging a to-do's pin to a manager reassigns it.

**People notice:** the board finally tells the truth. **Rollback:** revert.

### Phase 2: All problems on the Pin Board (small, no migration expected)
- New crew and sub problem reports pin themselves in the account manager's square.
- Done on the pin closes the report. Closing it elsewhere takes the pin down.
- Only reports created after go-live, so the board does not flood.

**People notice:** one place for problems. **Rollback:** a switch turns it off.

### Phase 3: Customer requests on the board (small)
- Portal Requests also pin themselves. The customer sees no change.

**Rollback:** a switch.

### Phase 4: "My to-dos" in the Sub Portal (small)
- A big tile on the sub's home screen: open tasks, tap to open, tap Done. EN/ES/PT.
- Built in `simple-home.tsx` and its API. **`page.tsx` is not touched.**

**People notice:** subs no longer depend on finding a text. **Rollback:** hide the tile.

### Phase 5: One notifier (internal, no visible change)
- Move text, push, and email decisions into one helper, same words and same timing.
- Fix bug D.

**Rollback:** revert.

### Phase 6: Board List view (medium, no data moves)
- A "List" button on the board with what To-Do has: filters, bulk edit, many accounts at once, print, outcome, finish visit.
- It still reads the old `todos` table. People try it while the To-Do page stays.

**Done when:** the office has used it for a full week and nothing is missing.

### Phase 7: Grow the task engine (migration 088, adds only)
- Tasks can belong to a manager or a sub. Account and due date become optional.
- Adds the fields to-dos need. Nothing uses them yet, so nobody notices.

**Rollback:** nothing to undo.

### Phase 8: Move To-Do into Tasks (the big one, do it on a quiet day)
1. Rehearse on the practice database, then compare counts and calendar events.
2. Back up (Neon restore point).
3. Copy the data, then switch `/api/to-do`, `flow-todos.ts`, reminders, and pins, behind one switch.
4. `/api/to-do` keeps answering, so other screens don't change.
5. Keep the old table read-only.

**Rollback:** flip the switch back. Anything created during the gap gets copied back by a prepared script.

### Phase 9: Retire the To-Do page (small)
- Remove it from the menu, and redirect `/to-do?id=...` to the same card.

**Wait:** at least 2 calm weeks after Phase 8.

### Phase 10: Retire Team Hub (only if Phase 0 says it is unused)
- Move any remaining crews to CW Now first, then hide the links and screens. Tables are kept.
- If crews still use it, this phase moves them one at a time, or we keep it and fix bug C.

### Phase 11: Tidy up (optional)
- Retire the Notifications page once the board covers it.
- Show task photos on the Photos page, after that page can handle private links.

---

## 7. Phase 0 query (read-only)

Run on production by someone with access, or tell me to and I will. It only reads.

```sql
-- To-dos: how many, how many open, how many are on the calendar
SELECT count(*) AS total,
       count(*) FILTER (WHERE lower(btrim(status)) NOT IN ('done','cancelled','canceled','completed')) AS open,
       count(*) FILTER (WHERE btrim(calendar_event_id) <> '') AS on_calendar,
       count(*) FILTER (WHERE flow_key IS NOT NULL) AS new_account_steps,
       count(*) FILTER (WHERE created_at > now() - interval '30 days') AS last_30_days
FROM todos;

-- To-dos with no ID, which the app hides
SELECT count(*) AS no_id FROM todos WHERE btrim(todo_id) = '';

-- Is Team Hub still used? (site_id = Team Hub, crew_link_account_id = CW Now)
SELECT CASE WHEN site_id IS NOT NULL THEN 'team hub' ELSE 'cw now' END AS source,
       count(*) AS reports, max(created_at) AS latest,
       count(*) FILTER (WHERE status = 'open') AS open
FROM hub_issues GROUP BY 1;

-- Problem and request backlog (how big a flood would be)
SELECT status, count(*) FROM sub_portal_issues GROUP BY 1 ORDER BY 2 DESC;
SELECT tab, status, count(*) FROM portal_requests GROUP BY 1, 2 ORDER BY 3 DESC;

-- Pins on the board now, by kind
SELECT kind, count(*) FROM handoff_items
WHERE board_pinned_at IS NOT NULL AND board_done_at IS NULL GROUP BY 1;

-- Is migration 087 in?
SELECT to_regclass('public.cw_now_tasks') IS NOT NULL AS tasks_table_exists;
```

---

## 8. Questions for you

Each has my recommendation, so you can just say "yes to all".

1. **Dragging a to-do's pin to another manager: should that reassign it?**
   Recommended: **yes.** That is what people already assume.
2. **Where should a crew or sub problem land?**
   Recommended: **the account manager's square, with a text.** The alternative is a shared "Problems" box.
3. **Does any crew still use Team Hub links?**
   Recommended: if the Phase 0 numbers show nothing recent, **retire it.**
4. **Which To-Do features does the office really use?** Bulk edit, printed sheets, outcome notes, assigning to many accounts?
   Recommended: **keep all of them** in the List view unless you tell me some are dead. Dropping any makes this simpler.
5. **Priority: keep Low/Medium/High, or simplify to Normal/Urgent?**
   Recommended: **Normal/Urgent**, with High becoming Urgent. It is simpler and matches CW Now.
6. **Old finished to-dos: move them too, or leave them as a read-only archive?**
   Recommended: **move the last 12 months, archive the rest.**
7. **Will you verify the Textbelt account so texts can carry links?**
   Recommended: **yes.** Until then, a sub's task stays "Needs link" until someone taps Share.
8. **Is a quiet day available for Phase 8?**
   Recommended: **a Saturday or Sunday morning**, when the fewest to-dos are being made.
