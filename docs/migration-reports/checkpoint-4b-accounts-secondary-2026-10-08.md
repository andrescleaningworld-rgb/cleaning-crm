## Checkpoint Area 4b (Accounts secondary) – 2026-10-08

Time: about 0.5 h actual vs 20 h estimate. Total so far: about 4.1 h vs 121 h estimated (areas 0, B, 1, 2, 3, 4a, 4b).

**New estimate.** 209 hours are still on the plan; at the measured pace that is about **8 to 22 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- No new data was moved in this area: these screens read the accounts and subcontractors that were already moved in Areas 3 and 4a, or they use Apps Script (Account Updates), which stays where it is for now.
- New look on: **Accounts Center** (tab bar, the three "Recent" lists, **Keys**, **Crew Link** queue), **Account Updates** (list and single update), **Account Health**, **Account Map**, and **Sub Center → Coverage** (By Sub, By Town, Map).
- The search box no longer shows two ✕ buttons in Edge and Chrome (all screens).

### Data check
Nothing to compare: no table was added. The accounts and subcontractor checks from Areas 3 and 4a still hold (re-run not needed; no save was made in this area's tests).

Not tested:
- **Saving an account update** (it goes to Apps Script and can send an email).
- **Generate code, the Copy tick box and the Cleaner picker** on the Keys tab, and **Resolve / Mark Ordered / Mark Delivered / Cancel** on the Crew Link tab (they save).
- **The Google map inside Coverage → Map.** The Google key refuses to work on this computer, so only the panels around the map were checked. The Account Map (the other map, with pins) was checked and works.
- "Use my location": the test browser has no location, so only the "could not get your location" path ran.

### Found while doing this (worth your attention)
1. **Keys tab: every "Cleaner" box says "Unassigned"**, even for accounts that have a cleaner. The box compares the cleaner's name with the sub's ID, so it never matches. It was like this before the redesign. Picking a cleaner there does save correctly. (Proposal 1.)
2. **Keys tab: "Generate code" and "Copy" are not kept.** The sheet has no column for them. The screen says it worked, and the value is gone after a reload. (Proposal 2.)
3. **Account Health is a demo.** It starts from three made-up examples, anything you add disappears on reload, and no menu leads to it. (Proposal 3.)
4. **19 accounts have a map location outside New Jersey / New York** and are hidden from both maps. Their addresses probably need fixing. Both map screens list them (tap the line that says "19 accounts…").
5. **29 accounts have no map location at all** on the Account Map (370 found, 341 with pins).
6. The practice database has the Crew Link tables with real-looking rows (1 open supply order), because it was copied from production. Nothing was changed there.

### Feature checklist: Accounts Center
| Before | Now |
|---|---|
| Six tabs: All accounts, Visits, Complaints, Updates, Keys, Crew Link; remembers the last one | Same six, new tab bar |
| Red number bubble on Crew Link | The number is in the tab name: "Crew Link (3)" |
| Recent Accounts / Visits / Complaints (5 each, linked) | Same |
| Keys: search, table with Key Code, Account, Cleaner, Copy, Access Info | Same; cards on a phone |
| Crew Link: Open Problems with Resolve; Open Supply Orders with Print, Mark Ordered, Mark Delivered, Cancel | Same |
| Visits and Complaints tabs | Not redesigned yet (Areas 7 and 8) |

### Feature checklist: Account Updates
| Before | Now |
|---|---|
| "Add Update" jumps to a form at the bottom of the page | Blue **Add update** opens the same form in a sheet |
| Back to Accounts / Back to Account | Back arrow |
| Search + Type, Manager, Sort in a row; Clear Filters | Search + **Filter and sort** sheet with the same three; Clear filters |
| "X of Y updates showing", only the latest 5 | Same |
| Table: Date, Account, Type, Manager, Notes, Notify Email, View Details | Same 7 columns on a wide screen; cards on a phone; **Open** |
| Form: account search (or the account named when opened from an account), date, 9 types, manager, notes, notify email | Same boxes, same checks, same request |
| Messages in a gray box under the form | Problems show in the sheet; "saved" shows on the page after the sheet closes |
| Single update: 6 facts, Back, Print, View Account | Same 6 facts; back arrow; **More → Print**; blue **Go to account** |
| "Update ID" box with a note to developers | Gone |

### Feature checklist: Account Health
| Before | Now |
|---|---|
| Print button | **More → Print** |
| 4 number boxes | Same |
| Status guide (4 levels) | Same |
| Search with Clear | Same |
| Form in the page, 11 boxes, auto status, Add / Clear Form | Blue **Add health item** opens the same 11 boxes in a sheet; Clear form |
| Empty notes: the button does nothing | Says "Internal notes are required." |
| Log with colored badges | Same, color + word |
| "Future Smart Connection" note | Same |

### Feature checklist: Account Map
| Before | Now |
|---|---|
| "Use My Location - load all pins near me" (green) | Blue **Use my location (load all pins near me)** |
| Asks for your location on arrival | Same |
| Search, Select account (first 250), Clear | Same |
| Manager and Sub dropdowns under the map | **Filter** sheet |
| Counts line, geocoding progress, "could not be found" warning, outside-area list, Load More Pins / Show All Pins | Same |
| Map with blue, orange and green pins; pop-up with Directions and Account | Same |
| Selected account floats over the map | Card under the map with Directions, Google Maps, Go to account |
| Nearby Accounts: 25 boxes, tap anywhere to select | 25 cards with **Show on map**; the address is a real link |

### Feature checklist: Coverage
| Before | Now |
|---|---|
| By Sub / By Town / Map switch | Same three, as chips |
| Search highlights matches and fades the rest | Same; matches are bold and underlined, not only blue |
| Card per sub: towns and zips with counts | Same |
| Card per town: subs covering it with zips | Same |
| Map: sub picker, counts, warnings, "Find closest subcontractors", Google map | Same; only the look of the panels changed |

Screen checks in a headless browser at 375px and 1280px: 54 for Accounts Center and Account Updates, 46 for Health, Map and Coverage. All passed; 7 first-run misses were wrong expectations in the tests or Apps Script not answering. Screenshots are not saved in the repo (customer names).

### Proposals awaiting approval (nothing here is built)
1. **Keys: show the real cleaner** in each Cleaner box (match by name). Three lines.
2. **Keys: store the key code and the Copy tick.** Two new columns, in the new database only. Or remove the two controls.
3. **Account Health: remove the page, or build it for real** (a table, saved items, a menu link).
4. Fix the 19 addresses outside the service area (you, in the sheet; the list is on the map screens).
5. Still waiting from earlier: the Apps Script source for Account Updates / proposals / packet; blank rows in the sheets; Portal access confirmation; name changes; Staff + Managers merge.

### Decisions made without you
1. Account Updates stays on Apps Script (as decided in 4a).
2. Keys and Account Health bugs are reported, not fixed (they change what the screens do).
3. The Update ID box was removed from the single-update page.
4. The Add forms on Account Updates and Account Health open in a sheet.
5. Account Health now says why it did not add an item when notes are empty.
6. The selected account on the map shows under the map.
7. The Crew Link number moved into the tab name; the tab bar shows words only.

### Protected files edited
None in this area. (Accounts Center shows the Visits page inside a tab; that page itself was not touched.)

### Readers still on Sheets / Apps Script
- Account Updates: read and save through Apps Script.
- Recent Visits and Recent Complaints on Accounts Center: Sheets (Areas 7 and 8).
- Crew Link queue: already in Postgres (production database), not part of this migration.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Accounts Center**. Six tabs across the top; swipe the bar sideways to reach Keys and Crew Link.
2. Tap **Keys**, type "dental". A few cards. **Do not tap Generate code or Copy.**
3. Tap **Updates**. Five newest updates. Tap **Open** on one: six facts and a blue **Go to account**.
4. Go back, tap **Add update**. The form opens. Tap **Cancel**.
5. Open **Account Map** (/map). Allow location if asked. Pins near you, and 25 cards below. Tap **Show on map** on one: a card with **Directions** appears under the map.
6. Open **Sub Center → Coverage**. Type a town name: matching towns are underlined and other cards fade. Tap **By Town**, then **Map**: the Google map should load here (it could not on my side). Tell me if it does not.

### How to undo
Revert the commits whose message starts with `migration(accounts-secondary)`.
