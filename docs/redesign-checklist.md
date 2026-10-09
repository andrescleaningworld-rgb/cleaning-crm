# Simple redesign: where everything went

Branch `redesign/simple`. For each screen, every button and field the old
screen had, and where it is now. Nothing was removed. "Same" means it is where
it was and does what it did.

Brand used on every screen:

- Navy bar (`#0C447C`) at the top: logo on the left, "Cleaning World", the page
  name under it, a back arrow when the screen has one, "?" and Menu.
- Main buttons green (`#3B6D11`), white text, 56px tall.
- Action tiles light green (`#EAF3DE`) with dark green icon and text (`#27500A`).
- Selected filter chips light blue (`#E6F1FB`, text `#0C447C`).
- Red only for problems. A cancelled account is gray, not red.
- 18px body text, tap targets 48px or more.

Shared pieces (in `app/ui/`): `Tips`, `SwipeRow`, `PullToRefresh`, `Tile`,
`undoable()` (the 5-second Undo), and the top bar's page name (`shell.ts`).

## Top bar (every screen)

| Old | Now |
| --- | --- |
| Blue banner with logo, "Cleaning World", "Service Portal & Operations" | Navy bar with logo, "Cleaning World" and the page name. The tagline is gone from the bar. |
| "?" (opened Help) | "?" shows the screen's tips again. On a screen with no tips it still opens Help. |
| Help | Menu → Help |
| Menu button (phone) with the red count | Same |
| Notifications, Portal, Dashboard, Accounts center, Sub Center, Sales, Reports, Documents, Equipment, Settings, Map, Logout | Same, inside Menu (always showing on a wide screen) |
| Back arrow and title at the top of each screen | Back arrow and the title are in the navy bar |

## Accounts Center → All accounts (`app/accounts/page.tsx`, `app/accounts-center/page.tsx`)

| Old | Now |
| --- | --- |
| Tabs: All accounts, Visits, Complaints, Updates, Keys, Missing emails, Crew Link | Same |
| Recent Accounts / Recent Visits / Recent Complaints / Recent Updates (on top) | Under the list: "Recent activity · tap to show" |
| Stat: Active | Big green count "Active" at the top. Tap = show active accounts. |
| Stat: Cancelled | Big gray count "Cancelled" at the top. Tap = show cancelled accounts. |
| Stat: High Risk | Counted inside the big red "Need you" (see below). The plain number is on the line under the list: "High risk: N". |
| Stat: Total Loaded | Line under the list: "Total loaded: N" |
| Stats: Revenue, Sub Pay, Gross Margin In Current View | Hidden until "Money hidden · tap to show" (bottom of the list) is tapped. Remembered on the device. |
| Search box + Search button | One box, "Find an account". The list narrows as you type. Enter (or the keyboard's Search key) still asks the server, as the button did. |
| "Filter and sort" button | Header More → Filter and sort (same sheet: Status, Manager, Subcontractor, Near Account, Radius, Min/Max revenue, Min/Max sub pay, Sort) |
| "Clear filters" button | Header More → Clear filters, and on the empty state. It now reloads the full list (it used to empty the list until Search was tapped). |
| Filter: Manager | Chip "My accounts" (your own), or Filter and sort → Manager (anyone) |
| Filter: Subcontractor | Chip "By sub", or Filter and sort |
| (new) | Chip "By town" |
| Header More: Transfer proposal, Create to-dos for multiple, Print sub account list, Print | Same |
| "Add account" (main button) | Same |
| Card: account name (link) | Same |
| Card: address (opens Maps) | Same |
| Card: status pill | Same. Cancelled is gray now. |
| Card: health pill | Card ⋯ → sheet. A High Risk account also shows the red "Needs you" pill and "Account health is High Risk." on the card. |
| Card: "N open problems" pill | Red border, red "Needs you" pill, the line "N open problems from the crew.", and a red "See problem" button (opens the Crew Link tab) |
| Card: Manager | Card ⋯ → sheet |
| Card: Sub | Same, with the cleaning days after it: "Sub: name · days" |
| Card: Started date | Card ⋯ → sheet |
| Card: revenue, share of total, sub pay, margin, frequency | On the card when money is showing; frequency is also in Card ⋯ |
| Card: distance (Near Account) | Same |
| Card: "Change status" | Card ⋯ → Change status |
| Card: "To-do" | Card ⋯ → To-do, or swipe the card left |
| Card: Select checkbox (bulk to-dos) | Same |
| (new) | Card: big green "Open" |
| (new) | Card ⋯: Call contact, Directions |
| (new) | Swipe a card left: Call, To-do |
| Wide screen: table with the same columns | Cards at every width (2 or 3 across on a wide screen) |
| "Show 15 more" | Same |
| Transfer proposal panel, its fields and its saved proposals | Same |
| Bulk to-do sheet, quick to-do sheet, change status sheet | Same fields |

What "Need you" counts: an account that is not cancelled and has an open
problem from the crew, or whose health is High Risk.

Interactions added: first-time tips (3), pull down to refresh, "Saved ✓" after
a status change, a 5-second Undo before an account is cancelled, Try again on
the status error.

## Account page (`app/accounts/[id]/page.tsx`)

| Old | Now |
| --- | --- |
| Back arrow, account name | In the navy bar. The full name is also on the page, above the address. |
| "Cleaning World Account" subtitle | Removed (the bar says Cleaning World) |
| Address (opens Maps) | Same, under the Next cleaning card |
| Status pill, health pill | Same, under the Next cleaning card |
| Stat: Manager | Next cleaning card ("Manager:"), and More → Full account info |
| Stat: Subcontractor (+ company) | Next cleaning card ("Sub:"), and More → Full account info |
| (new) | Next cleaning card: the next date and time window from Sub Schedules. With no dated schedule it shows the account's Cleaning Days and Frequency. |
| "Add visit" | Tile "Log visit" |
| "Add complaint" | Tile "Log problem" |
| "Add update" | More → Add update |
| Phone (in Account Snapshot) | Tile "Call contact", and still in More → Account Snapshot |
| Has Key, Alarm Info (in Account Snapshot) | Tile "Keys and alarm", and still in More → Account Snapshot |
| (new on this page) | Tile "Add to-do": the same form as the to-do on the accounts list |
| Header More: Change status | More → Change status |
| Header More: Portal access ON/OFF | More → Portal access: ON/OFF |
| Header More: Print PDF | More → Print PDF (Team Leader PDF / Admin PDF) |
| Header More: Send new account packet | More → Send new account packet |
| Header More: Customer email | More → Customer email |
| Header More: Send portal invite | More → Send portal invite |
| Header More: Onboarding checklist | More → Onboarding checklist |
| Header More: Add sale | More → Add sale |
| Header More: Full account info | More → Full account info |
| Stats: Monthly Revenue, Sub Pay, Est. Gross Margin | More → Money |
| Card: Account Snapshot (Contact Person, Phone, Email, Start Date, Cleaning Days, Frequency, Subcontractor Pay, Has Key, Alarm Info, Address) | More → Account Snapshot |
| Card: Notes | More → Notes |
| Onboarding section ("Open in Wizard View") | More → Onboarding |
| Porter checklist template (when the account uses one) | More → same place, after Onboarding |
| History ("Show changes") | More → History |
| "Edit account" (main button) | Same: one big green button at the bottom |
| Messages: packet sent, status changed, packet error, portal access error | Same, above the tiles |

Interactions added: first-time tips (3), "Saved ✓" after a status change, a
5-second Undo before the account is cancelled, Try again on the status error.

## Step 2: the rest of the app

Rules added in step 2, used on every screen below:

- At a glance: big tappable counts first (`Counts` in `app/ui/`), status as color + icon + word, short labels. Details are one tap deeper.
- Every card goes where you expect. Counts are links or filters.
- Every page has a back arrow in the navy bar except home (Dashboard for staff, the portal home for a sub or a customer). A screen says where its arrow goes; otherwise it goes one level up.
- Navigation is a left sidebar (see "Left sidebar" below). The navy bar keeps the logo, the page name, the back arrow and "?", plus the Menu button on a phone.
- Toasts ("Saved ✓", Undo) now come from one place for every page (`app/layout.tsx`).

### Top bar (changed again in step 2)

| Old (step 1) | Now |
| --- | --- |
| Every menu item always showing on a wide screen | Wide: four buttons (Dashboard, Accounts center, To-Do, Sub Center); everything else behind Menu |
| To-Do reached from the Dashboard | Also in the bar (wide) and in Menu |
| Back arrow only on screens that set one | On every page except home |

### Left sidebar (replaces the bar buttons and the Menu panel)

`app/components/CWHeader.tsx`. Wide screens: a navy sidebar that is always there, every section as icon + name, the current page highlighted in white. Phones: the Menu button slides the same sidebar in from the left over a dark backdrop; a tap on a link, the backdrop or the X closes it.

| Old | Now |
| --- | --- |
| Bar buttons: Dashboard, Accounts center, To-Do, Sub Center | Sidebar → Daily |
| Dashboard tiles only: Complaints, Visits, Supplies, Supply Orders, Crew Link | Also in the sidebar → Work |
| Menu: Sales, Reports, Documents, Equipment, Map | Sidebar → Office |
| Menu: Portal (with its red count) | Sidebar → Office → Portal Requests (with its red count) |
| Menu: Notifications (with its red count) | Sidebar → Office → Notifications (with its red count) |
| Menu: Settings, Help, Logout | Bottom of the sidebar |
| Menu button (wide) | Gone: the sidebar is always there |
| Menu button (phone), with the red total | Same button, now opens the sidebar |
| (new) | "Icons only" at the bottom of the sidebar (wide screens): shrinks it to icons, remembered on the device |
| Bar: logo, page name, back arrow, "?" | Same |
| Page content up to 1400px wide, centered | Uses all the width to the right of the sidebar |
| Sub portal menu: Home, Equipment | Same two, in the sidebar |
| Old customer portal menu: My Account, Requests, Complaints, History | Same four, in the sidebar |

### Dashboard (`app/page.tsx`)

| Old | Now |
| --- | --- |
| "Operations Command Center" title and paragraph | Removed. The bar says Dashboard. |
| Stat: Overdue To-Dos → To-Do | Two big counts. "To-dos pending": every open to-do, with a small red "N overdue" line under the number when any are overdue → To-Do on pending. "To-dos done": done this week → To-Do on done this week. |
| Stat: Visits This Month → Visits | Big count → Visits |
| Stat: Open Complaints → Complaints | Big count → Complaints filtered to open |
| Stat: Accounts Needing Attention → Accounts | Big count "Accounts need you" → Accounts Center on "Need you". It now counts by the same rule as Accounts Center (High Risk, or an open crew problem), so the number and the list agree. It used to also count "needs attention" health. |
| Stat: Active Accounts → Accounts | Big count → Accounts Center on Active |
| "Today's Manager To-Dos" (6 cards, each → To-Do) | "Do next": the same 6 cards. Each card opens that to-do. "All to-dos" button. |
| Buttons: To-Do List, Complaints, Supplies, Crew Link, Supply Orders (with red badges) | Tiles, with the count under the label ("28 overdue", "6 open", "2 new") |
| Quick Links: Visits, Sales, Subcontractors, Reports | Tiles |
| Print button | More → Print |
| Stats: Monthly Revenue, Monthly Sub Pay, Gross Margin | More → "Money hidden · tap to show" (same switch as Accounts Center) |
| Accounts Needing Attention table (8 rows) | More → "Accounts that need you": cards, each opens the account. Monthly revenue shows when money is showing. |
| Recent Complaints (5) | More → cards, each opens that complaint |
| Recent Supply Orders (5) | More → cards, each opens Supply Orders |

Added: tips (3), pull down to refresh, an empty state for no open to-dos.

### To-Do (`app/to-do/page.tsx`)

| Old | Now |
| --- | --- |
| Stat cards: Open, Overdue, Done | Two big counts, the same as on the Dashboard: "To-dos pending" (with the red "N overdue" line) and "To-dos done" (this week). Tap = filter. Under them, when anything is overdue: "Show only the N overdue". Every Done to-do, not just this week, is under Filters and more → Status → Done. |
| "New To-Do" form always open | Behind the green "+ Add to-do" button. Same fields. |
| Search box | "Find a to-do", always showing |
| Filters: Assigned, Status, Type, Priority, Sort | "Filters and more" |
| Open Google Calendar, Bulk Edit To-Dos, Print Assigned Tasks, Print This List | "Filters and more" |
| "Printed: date" line | Only on paper |
| To-do cards and every button on them | Same |
| SMS quota banner | Same |
| "Could not update to-do." pop-up box | A red message at the bottom of the screen |

Added: tips (3), pull down to refresh, "To-do saved ✓" / "Done ✓", a 5-second Undo before a to-do is cancelled, links `?filter=pending`, `?filter=done-week`, `?filter=overdue`, `?add=1` (and the existing `?id=`).

"Done this week" (`lib/toDoWeek.ts`): a to-do does not record the day it was marked Done, so it means status Done with a due date in this week (Monday to Sunday), or, with no due date, created this week.

### Complaints (`app/complaints/page.tsx`)

| Old | Now |
| --- | --- |
| Stats: Total, Open, Closed, Review, Not Valid, With Photos | Big counts: Open (everything not closed), To review, Closed. Tap = filter. The rest are on the line under the search: "Showing N of N · In progress · Not valid · With photos". |
| Search, Filter and sort, Clear filters | Same |
| Card: Open button | Same, now the green button |
| Card: Close complaint | Same, with a 5-second Undo before it is saved |
| Add complaint (main button) | Same |

Added: tips (3), pull down to refresh, "Complaint closed ✓", link `?status=open`.

### Visits (`app/visits/page.tsx`, protected file)

| Old | Now |
| --- | --- |
| Stats: Total Visits, Showing, Follow-Ups Needed | Big counts: This month, Need follow-up, All visits. Tap = filter. "Showing N of N" is a line under the filters. |
| Add visit (top) | Same |
| Search, Filter and sort, Clear filters, More → Print | Same |
| Card: Open | Same, now the green button |

Added: tips (3).

### Sub Center and Subcontractors (`app/subcontractors/page.tsx`)

| Old | Now |
| --- | --- |
| Tabs: Subs, Sub Schedules, Coverage, Activity Log; Subcontractors / Service Log | Same |
| (filters only inside Filter and sort) | Big counts: Active, High risk, No schedule. Each sets the matching filter. |
| Search, Filter and sort, Clear filters | Same |
| Card: revenue line (Sub revenue, CW revenue) | Hidden until "Money hidden · tap to show" |
| Card: Open | Same, now the green button |
| Card: Add schedule | Same |
| Add subcontractor (main button) | Same |

Added: tips (3), pull down to refresh.

### Equipment (`app/equipment/page.tsx`, `app/equipment/ui.tsx`)

Already in the simple style, so only the colors and words changed: green
main button, light-green job tiles, light-blue selected chip, back arrow to
the Dashboard, "Find equipment", clearer empty words. Every button, chip and
card is where it was.

### Supplies (`app/supplies/page.tsx`)

| Old | Now |
| --- | --- |
| Stats: Active Supplies, Inactive Supplies, Low Stock | Big counts: Active, Low stock (red when above 0), Inactive. Tap = filter. |
| Search | "Find a supply" |
| Supply Orders button, Add Supply | Same |
| Card: Edit, Remove | Same. Remove still asks first, then waits 5 seconds behind Undo. |

Added: tips (2), pull down to refresh, "Removed ✓".

### Settings (`app/settings/page.tsx`)

| Old | Now |
| --- | --- |
| Link cards: Customer Portal Access, Extra / Specialty Services, Equipment Categories & Staff, Activity Log (owner only), Logs | Light-green tiles, same places. Activity Log is still owner only. |
| Stat cards: Active Managers, Visit Types, Update Types, Complaint Validity Options | One line under "Lists used in the app" |
| Supply settings, Managers (owner), Manager Login Accounts (owner), Complaint Validity Options, Visit Types, Account Update Types, Account Statuses, Account Health Statuses | Same |

### Login (`app/login/page.tsx`, protected file)

| Old | Now |
| --- | --- |
| Title and paragraph | "Who are you?" |
| Admin Login card | Tile "Office staff" |
| Subcontractor Login card | Tile "Subcontractor" |
| Customer Portal card | Tile "Customer" |
| "Select your name to log in" | "Tap your name" |
| "Back to Login Options" | "Back" |
| Name list, password, set-up password, owner link | Same |

### Sub portal (`app/subcontractor-portal/page.tsx`, protected file)

| Old | Now |
| --- | --- |
| Blue banner with a paragraph | "Type your email to see your accounts." |
| Email box + "Access Portal" (stayed on screen after login) | Email box + "Open my portal". Hidden once logged in. |
| "Logged in as", name, email, Logout | Same, on one line with Logout |
| Pills: N Accounts, N Complaints, pay, Score, status | Big counts: Accounts, Complaints (red when above 0), Score. Tap Accounts or Complaints = that tab. Status and monthly pay are on the line above. |
| Six tab buttons in six colors | Same six, same order: plain, the open one light blue |
| Sticky block at the very top | Under the navy bar on a wide screen; not sticky on a phone |
| Every tab's content | Same |

Added: tips (2).

### Customer portal (`app/(customer)/portal/`)

The home was already eight big tiles and every page already had a back arrow.
Changed: the tiles are light green, buttons green, the navy bar on top. Nothing
moved.

### Other pages

Sales, Reports, Documents, Map, Supply Orders, Sub Schedules, Notifications,
Portal Requests, Help, and the add / edit forms keep their layout. They have
the navy bar with a back arrow, the green buttons and the 18px text.

## Handoffs: new accounts, account updates, supply orders

Upgrades to existing features so the handoffs between the office and the
account managers live in the app. Nothing that existed was removed.

How it is built: three small tables in Postgres (`db/migrations/018_handoffs.sql`)
hold, for each tracked thing, the step it is on, since when, and every move
(who, when, note). The checklist items, the account updates and the supply
orders themselves stay where they were. A database without these tables
(production, until migration 018 is applied there) simply does not show the
new parts. The rules are in `lib/handoffs.ts`.

Every handoff card says, in plain words, what happens now and who is next
("Now: The office enters the account." / "Next: Greg — Access and Safety
Information"), shows a progress bar ("Step 3 of 7"), and turns red when late.
After a tap: "Done ✓ — sent to [next owner]" with Undo for 5 seconds.

### New accounts (Onboarding Checklist)

| Old | Now |
| --- | --- |
| Onboarding checklist: 7 sections, 24 boxes, notes, autosave, wizard view, auto "Stable" at the end | Same |
| (new) | Account page → More → "Add accepted estimate": a photo or a PDF (same Blob storage as Documents, under `estimates/`) and the day it was accepted. "Start without the file" if there is no file. Then "See the accepted estimate" / "Replace the estimate". |
| (new) | Each checklist section shows its owner (Office or the account's manager) and its due date, counted from the acceptance day. The current section says "Now". |
| (new) | Account page, top: a "New account" card with the step, the owner, the days left, and "Open checklist" |
| (new) | Accounts Center → "New accounts" tab: one card per new account; counts In progress / Late / Waiting on me |
| Ticking a box only saved the box | Ticking the last box of a section also moves the account to the next section's owner, who sees it in My work |

### Account Updates

| Old | Now |
| --- | --- |
| Add update (form, fields, Notify Email) | Same. After saving: "Done ✓ — sent to Office". |
| List of updates: search, filter and sort, Open, Go to account | Same, under the heading "All updates" |
| (new) | "To process" list on top: oldest first, red after the days set in Settings → Team; counts To process / Late |
| (new) | Big green "Mark processed" with an optional note; saves who and when |
| (new) | On each update: "To process" or "Processed ✓ by [name], [day]" (and the note) |

Only updates saved from now on are tracked; older ones show nothing.

### Supply Orders

| Old | Now |
| --- | --- |
| Table of orders, Status dropdown (New, Needs Review, Approved, Pending / In Progress, Completed, Denied, Cancelled), filters, Generate PO, print | Same |
| (new) | "Orders in progress" on top: Ordered → Approved (manager) → Bought (office) → Delivered, with who has each order, counts In progress / Late / Waiting on me, and that step's one button (Approve order, Mark bought, Mark delivered) |
| Status changed only with the dropdown | The step buttons move the same Status (Approved, Pending / In Progress, Completed). A Status changed with the dropdown is picked up by the steps on the next load. Denied or Cancelled takes the order out of the steps. |

### Dashboard: My work

| Old | Now |
| --- | --- |
| "Do next": the 6 soonest to-dos | Still there, named "To-dos next", under My work |
| (new) | "My work": only what is waiting on the logged-in person across new accounts, account updates and supply orders; red first, then oldest; one tap opens the item. "Everyone's" shows all of it. |

### Settings → Team (`/settings/team`)

New page, with a tile in Settings. Pick the people who own the Office steps
(from the active managers), the days before an update or an order turns red
(default 2), and for new accounts each section's owner and due day. Everyone
on staff can read it; only the owner can change it. While nobody is picked as
Office, Office work goes to the owner.

Default owners and due days for a new account: Sale Confirmed (manager, day
1), Account Created in CRM (office, day 2), Access and Safety (manager, day
4), Subcontractor Notified (manager, day 5), Supplies and Equipment (office,
day 7), Customer Contact (office, day 7), First Visit and Follow-Up (manager,
day 21).

### Help → How it works (`/help/how-it-works`)

New page, linked at the top of Help and from the New accounts board: the idea
in four lines and one picture per flow, drawn from the same step lists the
screens use.

### Emails

| Email | Now |
| --- | --- |
| New supply order (to the office), when supplies run on Postgres | Says what is waiting and links straight to the order |
| Account update | Unchanged. It is sent by the Google Apps Script, which this work does not edit. |
| New account / onboarding | There was none, and none was added |

First-time tips were added on: My work, the New accounts board, the To
process list, Orders in progress, Settings → Team.
