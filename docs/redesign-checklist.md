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

## Not done yet (step 2, after the OK)

Dashboard, To-Do, Sub Center, Subcontractors, Complaints, Visits, Equipment,
Supplies, Settings, login, customer portal, sub portal. They already have the
navy bar and the green buttons, because those come from the shared styles.
Their layouts, tips, swipe, pull-to-refresh and Undo are still to do.
