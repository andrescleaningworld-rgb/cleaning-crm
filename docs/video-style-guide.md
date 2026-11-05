# Video style guide: how the staff app looks

For redrawing app screens in the tutorial video, using fake data. Every value here comes from the code as of November 4, 2026 (`main` at `63f104c`).

Main sources:
- `app/globals.css`: the design tokens, the shell, the UI kit. The block headed "Simple redesign" near line 2186 comes last and re-colors the kit, so its values are the ones on screen.
- `app/board/board.module.css`: the Pin Board.
- `app/components/CWHeader.tsx`: the navy bar and the sidebar.
- `lib/googleSheets.ts`, function `computeSubcontractorScore`: the sub score.

Some pages use plain Tailwind classes (Crew Link, Equipment, the Equipment Check tablet, parts of To-Do). The app runs Tailwind v4, which defines its colors in `oklch`. The hex values given for those classes are the standard Tailwind palette values; they look the same on screen.

---

## 1. Colors

### The tokens that are on screen

These are the final values, after the redesign block overrides the first kit.

| Token | Hex | Used for |
|---|---|---|
| `--ui-navy` / `--ui-brand` / `--ui-brand-ink` | `#0c447c` | Navy top bar, sidebar, Second-button border and text, selected tab underline and text, links, the "now" step on the pizza tracker |
| `--ui-navy-ink` | `#093560` | Navy shadows |
| `--ui-green` / `--ui-good` | `#3b6d11` | **Main button** (every "Add …", Save, Open), done pills' text, pizza tracker done steps |
| `--ui-green-press` | `#2f570d` | Main button on hover or press |
| `--ui-green-soft` / `--ui-good-soft` | `#eaf3de` | Light-green action tiles (account page), "done" pill background, green count tile |
| `--ui-green-ink` | `#27500a` | Text on light-green tiles and count tiles |
| `--ui-sky-soft` / `--ui-brand-soft` | `#e6f1fb` | **The blue banner** on the account page (Next cleaning), selected filter chip, "info" count tile |
| `--ui-surface` | `#ffffff` | Cards, inputs, Second buttons, sheets |
| `--ui-surface-2` | `#eef4fb` | Table header row, quiet button hover, photo placeholders |
| `--ui-paper` | `#f6fafe` | Swipe-row background |
| `--ui-ink` | `#10233f` | **Main text** |
| `--ui-muted` | `#52627a` | **Muted text**: subtitles, card lines, labels in detail lists |
| `--ui-line` | `#c9d6e4` | **Borders** of cards, inputs, chips; pizza tracker steps still to come |
| `--ui-line-soft` | `#e3ebf4` | Soft dividers: table rows, tab bar underline, photo groups |
| `--ui-warn` | `#8a5300` | **Yellow status** text ("Waiting", "Watch", "Needs Attention") |
| `--ui-warn-soft` | `#fdf0dc` | Yellow status pill background |
| `--ui-bad` | `#b3261e` | **Red status** text, red count tile text, red badges, "See problem" button, Delete outline |
| `--ui-bad-soft` | `#fce7e5` | Red pill background, red count tile, invalid input background |
| `--ui-off` | `#52627a` | Grey "off" status text |
| `--ui-off-soft` | `#eceff3` | Grey pill and count tile background |

### Background and page frame

| Thing | Value |
|---|---|
| Page background (`body`) | `linear-gradient(180deg, #eef7ff 0%, #f8fbff 45%, #ffffff 100%)` |
| Main white panel (`main.cw-page-card`) | `rgba(255,255,255,0.78)`, 1px border `#dbeafe`, shadow `0 10px 30px rgba(15,23,42,0.06)` |
| Navy top bar | `#0c447c`, shadow `0 2px 10px rgba(9,53,96,0.25)` |
| Sidebar | `#0c447c`. Phone slide-in shadow: `4px 0 24px rgba(9,53,96,0.35)`; phone backdrop `rgba(16,35,63,0.6)` |
| Sheet (pop-up) backdrop | `rgba(16,35,63,0.55)` |

### Buttons

| Button | Background | Text | Border |
|---|---|---|---|
| Main (`ui-btn-main`) | `#3b6d11` (hover `#2f570d`) | `#ffffff` | none |
| Second (`ui-btn-second`) | `#ffffff` (hover `#e6f1fb`) | `#0c447c` | 2px `#0c447c` |
| Quiet (`ui-btn-quiet`) | transparent (hover `#eef4fb`) | `#0c447c` | none |
| Problem (`ui-btn-problem`, "See problem") | `#b3261e` | `#ffffff` | none |
| Danger (`ui-btn-danger`, "Missed") | `#b3261e` | `#ffffff` | none |
| Delete (`ui-btn-delete`) | `#ffffff` (hover `#fce7e5`) | `#b3261e` | 2px `#b3261e` |
| Top-bar buttons (Back, ?, Home, Edit) | `rgba(255,255,255,0.12)` (pressed `0.28`) | `#ffffff` | 2px `rgba(255,255,255,0.45)` |

### Pills (status), chips (filters), tabs, count tiles

| Thing | Normal | Active / selected |
|---|---|---|
| Status pill: done / good | bg `#eaf3de`, text `#3b6d11` | n/a |
| Status pill: waiting / yellow | bg `#fdf0dc`, text `#8a5300` | n/a |
| Status pill: needs-you / red | bg `#fce7e5`, text `#b3261e` | n/a |
| Status pill: off / grey | bg `#eceff3`, text `#52627a` | n/a |
| Filter chip (`ui-chip`) | bg `#ffffff`, text `#10233f`, 2px border `#c9d6e4` | bg `#e6f1fb`, text `#0c447c`, 2px border `#0c447c` |
| Tab (`ui-tab`) | transparent, text `#52627a`, no underline | text `#0c447c`, 4px underline `#0c447c` |
| Tab bar | 2px bottom line `#e3ebf4` under all tabs | n/a |
| Count tile, good | bg `#eaf3de`, text `#27500a` | adds 3px border in its own text color |
| Count tile, bad | bg `#fce7e5`, text `#b3261e` | same |
| Count tile, off | bg `#eceff3`, text `#52627a` | same |
| Count tile, info | bg `#e6f1fb`, text `#0c447c` | same |
| Sidebar item | transparent, white text (hover `rgba(255,255,255,0.14)`) | bg `#ffffff`, text `#0c447c` |

### Cards and borders

| Thing | Value |
|---|---|
| Card (`ui-card`) | bg `#ffffff`, 1px border `#c9d6e4`, shadow `0 1px 2px rgba(16,35,63,0.05), 0 8px 24px rgba(16,35,63,0.07)`; a card you can tap gets a `#0c447c` border on hover |
| Account card (`ui-acct`) | bg `#ffffff`, **2px** border `#c9d6e4`, no shadow |
| Account card with a problem | border `#b3261e` |
| Cancelled account card | bg `#eef0f3`, dashed border, text `#5b6573` |
| Stat box (`ui-stat`) | bg `#ffffff`, 1px border `#c9d6e4` |
| Dashed "Money hidden · tap to show" bar | transparent, 2px **dashed** `#c9d6e4`, text `#52627a` |

### Red / yellow / green status, everywhere

- **Green**: `#3b6d11` on `#eaf3de`.
- **Yellow**: `#8a5300` on `#fdf0dc`.
- **Red**: `#b3261e` on `#fce7e5`.
- **Brighter red** used by the sub score alert, the board's red tags and corners, and the red pin: `#c62828`; the alert card background is `#fdecea`.
- **At risk dots** on account cards: 🟢 OK, 🟡 Watch, 🔴 At risk, shown as green, yellow and red pills.

### The blue banner on the account page

It is the "Next cleaning" box (`ui-next`):
- background `#e6f1fb`
- text `#0c447c`
- radius 18px, padding 16px
- no border
- the lower "Snapshot" part has a top line in 25% navy (`color-mix(in srgb, #0c447c 25%, transparent)`) and main text `#10233f`

### Gold "Ready to start" badge

- background `linear-gradient(180deg, #FFE27A 0%, #F2B705 100%)`
- text `#3D2B00`
- border `#B07F00`
- full pill radius, shadow `0 1px 3px rgba(0,0,0,0.25)`, weight 900
- reads "★ Ready to start"

### Other badges and banners

- **Red count badge** (top bar Menu, sidebar items): bg `#b3261e`, white.
- **Sub score alert badge** on the Accounts center sidebar item: bg `#c62828`, white, text "⚠ 2".
- **Gold rule box** on Extra Jobs ("Extra jobs not in the app don't get paid."):
  - bg `#fff6c9`, 3px border `#e0b400`, text `#3d2f00`
  - 20px, weight 800, radius 14px
- **Green rule box** on Help ("If it's not in the app, it does not exist!"): bg `#3b6d11`, white, 1.5rem, weight 900.
- **Toast** ("Saved ✓"): pill, bg `#3b6d11`, white. Error toast: `#b3261e`.

---

## 2. Fonts

**Family.** Every screen built with the UI kit (that is nearly all of them) uses:

```
ui-rounded, "Segoe UI", system-ui, -apple-system, Arial, sans-serif
```

On Windows this shows as **Segoe UI**; on an iPhone or Mac as **SF Pro Rounded**. The base `body` font, used only outside the kit, is `Arial, Helvetica, sans-serif`.

The handwritten to-do notes on the Pin Board use **Caveat**, weight 700, from Google Fonts.

| Text | Size | Weight | Notes |
|---|---|---|---|
| Body text (`ui-screen`) | 18px | 400 | line-height 1.5 |
| Page name in the navy bar | 20px (18px on phones under 480px) | 800 | at most 2 lines |
| "Cleaning World" above the page name | 14px | 700 | 90% opacity |
| Screen title (`ui-screen-title`) | 24px; 28px from 640px | 800 | **Hidden on screen.** The page name shows in the navy bar instead; the title prints. |
| Screen subtitle | 16px | 400 | muted |
| Section heading (`ui-section-title`) | 22px | 800 | |
| Card title | 20px | 800 | |
| Account card name | 21px | 800 | |
| Card lines (`ui-card-text`) | 18px | 400 | muted |
| Field label | 18px | 700 | |
| Hint under a field | 16px | 400 | muted |
| Buttons | 18px | 700 | |
| Main button alone in the bottom bar | 20px | 700 | |
| Status pill | 16px | 800 | |
| Filter chip / tab | 18px | 700 | |
| Count tile number | 32px | 800 | |
| Count tile label | 16px | 800 | |
| Stat box label / value | 16px muted / 22px | 400 / 800 | |
| Sidebar item | 17px | 700 | |
| Sidebar group label ("DAILY") | 13px | 800 | uppercase, letter-spacing 0.08em, 75% opacity |
| Sidebar top title "Cleaning World" | 18px | 800 | |
| Top-bar buttons | 18px | 800 | |
| Light-green tile label / detail | 19px / 16px | 800 / 400 | |
| "NEXT CLEANING" label in the banner | 16px | 800 | uppercase, letter-spacing 0.04em |
| Next cleaning day / time | 28px / 20px | 800 / 700 | |

---

## 3. Shapes: corners, shadows, padding

| Token | Value |
|---|---|
| `--ui-r-control` (buttons, inputs) | **14px** |
| `--ui-r-panel` (cards, tiles, sheets) | **18px** |
| `--ui-r-pill` | 999px |
| `--ui-tap` (normal height) | 48px |
| `--ui-tap-main` (main-button height) | 56px |
| `--ui-gap` (space between blocks) | 16px |
| `--ui-shadow` | `0 1px 2px rgba(16,35,63,0.05), 0 8px 24px rgba(16,35,63,0.07)` |

| Element | Corners | Padding | Height | Shadow |
|---|---|---|---|---|
| Button | 14px | 8px 20px | min 48px (main 56px) | none; presses to `scale(0.97)` |
| Input | 14px | 10px 14px | min 48px | none; 2px border `#c9d6e4` |
| Search box | 14px | left 46px for the magnifier, right 52px for the clear ✕ | 48px | none |
| Status pill | 999px | 4px 12px 4px 8px (icon on the left, 20px) | | none |
| Filter chip | 999px | 8px 18px | min 48px | none |
| Tab | square; 4px underline when selected | 8px 16px | min 48px | none |
| Card | 18px | 16px | | `--ui-shadow` |
| Account card | 18px | 16px; gap 8px | | none |
| Count tile | 18px | 10px 4px | min 88px | none |
| Light-green action tile | 18px | 14px 8px | min 112px; 36px icon | none |
| Sidebar item | 12px | 8px 12px; icon 24px, gap 12px | min 48px | none |
| Top-bar button | 14px | 0 12px | 48×48 min | none |
| Sheet (pop-up) | 18px 18px 0 0 on a phone (bottom sheet); centered box on desktop | 24px 16px | | backdrop only |
| Main panel | 24px (16px on phones) | 22px (12px on phones) | | `0 10px 30px rgba(15,23,42,0.06)` |

---

## 4. The shell

```
┌──────────────┬──────────────────────────────────────────────────────────────┐
│ Cleaning     │ [←] [logo] Cleaning World               [Edit] [?] [⌂ Home] │ ← navy bar, 64px, sticky
│ World        │            Accounts center                                   │
├──────────────┤──────────────────────────────────────────────────────────────┤
│ DAILY        │  ┌────────────────────────────────────────────────────────┐  │
│ ▣ Board      │  │ white panel, 24px margin, 22px padding, 24px corners   │  │
│ ▣ Accounts ⚠2│  │   page content…                                        │  │
│ ▣ Photos     │  └────────────────────────────────────────────────────────┘  │
│ ▣ To-Do      │                                                              │
│ ▣ Sub Center │                                                              │
│ ──────────── │                                                              │
│ WORK  …      │                                                              │
│ OFFICE …     │                                                              │
├──────────────┤                                                              │
│ ⚙ Settings   │                                                              │
│ ? Help       │                                                              │
│ ⎋ Logout     │                                                              │
│ « Icons only │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
    248px
```

### Sidebar (wide screens, 900px and up)

- **Size and position:** fixed on the left, full height, **248px** wide, navy `#0c447c`, no shadow. The page to its right starts at 248px. "Icons only" shrinks it to **72px**, showing icons with no labels or group names.
- **Top:** 64px high, with "Cleaning World" in white, 18px/800, padding `8px 8px 8px 20px`, and a 1px line `rgba(255,255,255,0.18)` under it. **There is no logo in the sidebar**; the logo is in the navy bar.
- **Groups**, in this order:
  - **DAILY**: Board, Accounts center, Photos, To-Do, Sub Center
  - **WORK**: Complaints, Visits, Extra Jobs, Supplies, Supply Orders, Crew Link
  - **OFFICE**: Overview, Sales, Reports, Documents, Equipment, Map, Portal Requests, Notifications, Email log
  - Each group label is small uppercase white text at 75% opacity. Groups are split by a 1px line `rgba(255,255,255,0.14)` with 8px space above and below.
- **Foot**, under a 1px line: Settings, Help, Logout, then "Icons only".
- **Items:** white outline icon (24px, 2px stroke) and name.
  - The current page's item is a **white rounded block (12px) with navy text and icon**.
  - Hover is a faint white tint.
  - A red number badge shows on Notifications and Portal Requests when there are new ones.
  - Accounts center shows a red **⚠ N** badge when a sub's score is under 6.
- **On phones:** the sidebar is hidden. A **Menu** button in the navy bar slides it in from the left (up to 300px wide), over a dark backdrop, with a ✕ close button at the top.

### Navy top bar

- **Size:** sticky, `#0c447c`, min 64px tall. Padding is `8px 24px` on desktop and 8–12px on phones.
- **Left to right:**
  1. Menu (phones only)
  2. Back arrow button (not on home pages)
  3. Logo: a white rounded box, 60×44px, 10px corners, 4px padding, holding the round Cleaning World emblem. It goes to the Board.
  4. Two lines: "Cleaning World" (14px, faint) above the **page name** (20px, bold). This is the page title; the page itself does not repeat it.
  5. On the account page and the sub page, an **Edit** button.
  6. **?** button (shows the page's tips, or opens Help)
  7. **⌂ Home** button (not on the Board itself)
- **Buttons:** 48px squares with 14px corners, a light white outline and a faint white fill.

### Page frame

- **Panel:** content sits in one large white panel (`main.cw-page-card`). Its margin is 24px on desktop and 12px on phones; its padding is 22px (12px on phones).
- **Spacing:** blocks inside a page are stacked 16px apart.
- **Add buttons:** every page's **Add … buttons** (green, with a ＋) sit at the top right of the page on desktop, on the subtitle's row. On a phone they go full width under it.
- **Bottom bar:** when a form has one main action (Save), it sits in a sticky bar at the bottom: right-aligned on desktop (min 180px wide), full width on a phone.

---

## 5. Pages, top to bottom

Lists follow one rule: **cards on a phone, a table from 900px wide**. The table has a `#eef4fb` header row with muted 16px headings, rows split by `#e3ebf4`, and an 18px outer radius.

### Board (`/board`, "Pin Board")

1. **Add buttons**, top right, green: "＋ New accepted account", "＋ Pin something", "＋ Extra job".
2. **Motto paper**: a small cream note (`#fffdf5`, 1px border `#e6dcc0`, tilted −1°) held by a red pin, reading "If it's not in the app, it does not exist!" in navy, 18px/800.
3. **Tabs:** Whole board · My square · Calendar · TV mode.
4. **Big green button** across the full width: "📺 TV Mode (Full Screen)", 76px tall, 26px text. The owner also sees a white "Show on TV" button under it.
5. **The board itself:**
   - **Wood frame:** 14px padding, 18px corners, brown wood gradient.
   - **Cork:** tan `#c79a63` with speckles and an inner shadow, 16px padding.
   - **Row 1, shared squares, left to right:** New accepted · Extra jobs · Complaints · Supply orders, plus **Office** when it has something.
   - **Row 2:** one square per manager.
   - **Each square:**
     - a dashed white outline (2px, 55% white) with 10px corners, at least 170px tall
     - at the top, a **cream name tag** (`#fffdf5`, 18px/800, small shadow) and a **dark round count** (`rgba(16,35,63,0.82)`, white)
     - your own square has a solid **gold** outline `#ffe27a`
     - empty squares say "Tap to add"
     - squares are at least 230px wide and wrap to fit
   - **Papers (pins):**
     - small sheets 150–240px wide with almost square corners (2px), a soft shadow, and a **round pin at the top center**: **red** when nobody has taken it, **green** once someone tapped "Got it"
     - paper color by kind: New account white `#ffffff`, Extra job light blue `#d6e9ff`, Complaint pink `#ffd9e6`, Supply order light green `#d9f2cf`, To-do note yellow `#fff3a0` (in Caveat handwriting, 26px), Account update green `#c9ecc4`
     - on each paper: a small uppercase kind label (13px/800, `#3d4f69`), then the title (account name or note, 18px/800, up to 3 lines)
   - **Extras that can appear on a paper:**
     - a dark badge ("3 items", or "Handed to …")
     - a green "Got it: Name" line
     - a green progress bar (checklist "2 of 5 done")
     - an orange **"Status needed"** tag (`#e65100`)
     - a brown status line ("Waiting on sub · Name · Oct 27")
     - a tilted red **days tag** in the top right ("9 days") when it has been up too long; the paper also yellows and curls at the corner
     - a red folded corner, bottom right, when overdue
     - a green ✓ circle, top left, when done (it comes down the next day)
     - a red outline when a new account has been stuck for 2 work days
   - **A full square** shows a **pile**: three stacked sheets (yellow, blue, cream) with one pin and a big dark "+4 more" circle.
6. **Hint line** (muted): "Tap empty space in a box to add something there. Tap a note to open it. Drag it into a square to hand it off…"
7. White **"Done tray (N)"** button. The owner also sees a link: "Pin Board settings and TV links".

**The paper pop-up** (tap a paper; it opens as a sheet titled with the paper's name):
1. The paper, large: same color as the paper, 6px corners. It has:
   - a small uppercase kind line
   - the big title (26px/800)
   - a fact list: **Account**, **Who**, **Due**, **Details**, **Checklist**, **Last update** (for example, "Pinned Oct 30 by Name")
2. For an extra job: a big green **"Done ✓"** button, 68px tall, 24px text.
3. Status check: four big buttons, two across: **On it · Waiting on customer · Waiting on sub · Done**, with an optional note and the history.
4. For a new account:
   - the gold "★ Ready to start" badge, when ready
   - a "Setup · X of Y done" button
   - a bold line, "Step 3 of 8 …"
   - the **vertical pizza tracker** (see the account page below)
   - a "Stuck?" note
5. A row of buttons: "Open full details" (or "📄 Open order") · "📄 Open PDF" · Print · Unpin · **Got it** (green when there is nothing to open) or "Give it back".
6. "Hand it to": one white button per other manager, and a quiet "Shared square" (or "Office").

**Calendar tab** (`/board/calendar`, "Cleaning calendar"):
1. Green "＋ Add to calendar" at the top right.
2. The same Board tabs, with Calendar selected.
3. A second set of tabs: **Today · Week · Month**.
4. A row: white "Earlier" button · the date or range as a heading · white "Later" button. A quiet "Back to today" appears when you have moved away from today.
5. Three count tiles: **Total** (blue info) · **Done** (green) · **Missed** (red when above 0, else grey).
6. Two drop-downs: Manager (All managers) · Sub (All subs).
7. Legend with small 18px rounded swatches:
   - Cleaned: `#eaf3de` with a `#3b6d11` border
   - Scheduled or not confirmed: `#eceff3` with a `#9aa9bd` border
   - Missed: `#fce7e5` with a `#c62828` border
   - Extra job: `#e6f1fb` with a `#1f6fd0` border
8. **Today:** a list of cleaning cards in those colors. **Week:** seven columns with the day's name; today is tagged "Today". **Month:** a Mon–Sun grid where each day shows its number, a total, and small colored count dots.
9. Tapping a cleaning opens a sheet with "Cleaned" (green) · "Missed" (red) · Undo · Pin · "Open account".

### Accounts center (`/accounts-center`)

Above the tabs, and only when there is something to show:
- a **red sub score alert card**: `#fdecea` background, 2px `#c62828` border, a red round "!" icon, and "N subs dropped below 6", tappable
- a "no schedule" tile

**Tabs:** All accounts · Transfers · New accounts (N) · Visits · Complaints · Updates · Keys · Missing emails · Time on site · Crew Link (N).

**All accounts** (subtitle: "Tap a number to see those accounts."):
1. Green "＋ New accepted account" and "＋ Add account" at the top right, and a ⋯ More menu.
2. Search box: "Find an account".
3. **Four count tiles in a row:** Active (green) · Need you (red) · **At risk** (red) · Cancelled (grey).
4. A dashed bar, when there are any: "💲 Overdue price reviews (N)".
5. Filter chips: **My accounts · By sub · By town**.
6. A grid of **account cards**: 1 column on a phone, 2 from 800px, 3 from 1250px. Each card, top to bottom:
   - Account name, 21px bold. The gold "★ Ready to start" can follow the name.
   - Address as a link.
   - "Last visit Oct 3, 2026 (30 days ago)" or "Never visited".
   - A row of pills: "Needs you" (red, if a problem), the status pill ("Active" green), the risk pill ("Watch" yellow or "At risk" red).
   - A red problem line, if any, and the risk reason ("2 complaints this month").
   - "Sub: Name · Mon, Wed, Fri".
   - When money is shown: the monthly price, sub pay and "We keep".
   - At the bottom: a wide **green "Open"** button (red **"See problem"** when there is a problem) and a white square **⋯** button.
   - Swiping a card left shows Call and To-do.
7. Dashed bars: "Money hidden · tap to show" and "Recent activity · tap to show".

**New accounts** ("Every new account, the step it is on, and who has it."):
1. Green "＋ Add a new account" at the top right.
2. **From Markate (N)** section heading, with a muted line: "Accepted commercial estimates with a recurring item. Start the account, or skip it." Then cards, each with:
   - the customer name
   - "**$1,200** · Oct 28 · EST-1043"
   - "Recurring: …" and a "See the estimate" link
   - a green **"Start new account"** button and a white **"Skip"** button
3. Three count tiles: **In progress** (blue) · **Late** (red when above 0) · **Waiting on me** (grey).
4. Account cards, each with:
   - the name, the gold badge if ready, and a yellow pill "Step 3 of 8" (red "Late · Step 3 of 8" when stuck)
   - **bold step action** · who has it
   - the small **horizontal pizza bar**: 8px-high segments, green done, navy now, grey to come
   - "Manager: Name" and an optional "Stuck: …"
5. A white "How it works" button.

**Keys** ("Key codes, who holds each key, and account access info."):
1. A search box: "Search by account, key code or key holder".
2. Buttons to print key tags for the selected accounts.
3. One card per account (a table on desktop, with columns Tag ☐ · Key Code · Account · Key holder · Copy · …). Each card shows:
   - the account name
   - **Key code**, with a "Generate" button when there is none
   - a Key holder field and a Copy box
   - **Key / Alarm / Access Info** text and an alarm field

**At risk** is not its own tab. It is the red **"At risk"** count tile on All accounts plus the pill and reason line on each card. Levels are green "OK", yellow "Watch" and red "At risk". On the account page the same flag shows under the status pills.

### Account page (`/accounts/[id]`)

The navy bar shows the account name and an **Edit** button. Then, top to bottom:

1. **The blue banner** (`#e6f1fb`, navy text, 18px corners):
   - "NEXT CLEANING" (small uppercase)
   - the **day** (28px bold, for example "Thursday, Nov 6")
   - the **time** (20px, for example "6:00 pm – 9:00 pm")
   - "**Sub:** Name" and "**Manager:** Name"
   - the gold **"★ Ready to start"** badge (banner size: 22px, 3px gold border) while the account is ready and not live yet
   - under a thin navy line, **SNAPSHOT**: a two-column label/value list (Start Date, Schedule, Time on site, CW Pay, Subcontractor Pay (70%), We keep (30%), Sub price per cleaning, Has Key, Alarm Info, Address)
   - a white **"More"** button
2. **"New account setup" card** (new accounts only):
   - a bold line "Step 4 of 8: Contact customer · with Name"
   - the **vertical pizza tracker**: one row per stage, each 40px high, joined by a 2px line (green where done)
     - **done:** 28px **green circle with a white ✓**, name in dark green
     - **now:** **navy dot** with a soft 5px light-blue ring, name bold 18px, then "with Name" in navy (dot, ring and name turn **red** when stuck 2 work days)
     - **to come:** grey ring, grey name
     - each line ends in a small "Mark done" or "Undo"
   - stages: Packet · Sub picked · Sub OK · Customer called · Site survey · Walkthrough · Start date · First-clean follow-up · Live
   - a "Setup · X of Y done" button
   - **the one big green button for the current step**: "Send welcome packet" · "Choose subcontractor" · "Mark done: Name said yes" · "Mark done: customer called" · "Mark done: site survey" · "Mark done: walkthrough" · "Save start date" (with a date field) · "Done: account is live" (with a note box)
   - a "Step history" list
3. Two pills: account status ("Active") and account health.
4. The At risk flag and other reminders.
5. The full account name (21px bold) and the address.
6. **Six light-green tiles** (`#eaf3de`, dark green text, 2 across on a phone, 3 from 800px, at least 112px tall, 36px icon on top): **Call contact** (with the contact's name) · **Add to-do** · **Log problem** · **Log visit** · **+ Extra job** · **Keys and alarm**.
7. **"Everything for this account"**: more light-green tiles, each with a big number (28px). Some show a red "N open" pill, and some have a small green-outlined "+ New" link below.
8. Behind **More**: the "More for this account" heading, then a 2-column grid of white buttons:
   - Change status, + Add update, + Add sale, Print PDF, Send Sub Packet
   - Send Customer Welcome Packet (or "…: Sent Oct 2")
   - Portal access: ON/OFF, Tax exempt, Invite to portal, 👁 View as customer
   - Onboarding checklist, Full account info, Photos, Supplies, Pin to board
   - then on its own row a normal-size **red-outlined "Delete account"**
   - then site stock, a **Money** card (three stat boxes), contacts and notes

### Add Account form (`/accounts/new`, "Add New Account")

Subtitle: "Use the full address in one field." Five white cards in order:
1. **Account Information**: Account name · Status · Account start date · Account health · Portal access · Address (Google address search: "Start typing and pick a suggestion…").
2. **Assignment & Pricing**:
   - Manager · Subcontractor (with nearby, available sub suggestions)
   - "Time" and "Length" pickers with big − / ＋ buttons
   - Monthly revenue
   - the sub pay boxes (a 70% suggestion, Frequency, Sub pay, Sub price per cleaning)
3. **Customer Contacts**: one or more contacts, "+ Add contact".
4. **Service Details**: Service type · Cleaning days · the schedule form (big green day buttons when picked).
5. **Access, Scope & Notes**: Has key? · Checklist needed? · Alarm code · Key / Alarm / Access Info · Scope of work · Notes.

A sticky bottom bar holds a green **"Save account"** and a quiet **"Cancel"**. After saving:
- a "✓ Name is saved" card
- a green "Send Customer Welcome Packet" button
- white "Open the account" and quiet "Back to accounts" buttons

(The new-account flow starts from **"New accepted account"** at `/accounts/new-accepted`. That form makes the account with its 8 steps.)

### Photos (`/photos`, "Every photo in the app, by account, issue and date.")

1. Green "＋ Add photos" at the top right.
2. Search box: "Find an account".
3. Three count tiles: **This week** (blue) · **Problems** (red when above 0) · **Before / After** (green).
4. Chips: **Account · Issue · All dates**.
5. A muted line, for example "24 accounts with photos · 312 photos in all".
6. **Account cards** (2 across on a phone, about 200px each on desktop). Each is a white card with 18px corners and a shadow:
   - a **4:3 thumbnail** across the top
   - the account name below it, then "12 photos · last Oct 30"
7. Tapping a card shows a white "← All accounts" button and the account name as a heading. Then the photos in groups, with a section heading and "N photos". The grid has square thumbnails (12px corners), 3 across on a phone and about 150px each on desktop. A dark gradient strip on each photo carries its label. Tapping a photo opens it full screen.

### To-Do (`/to-do`)

1. Green **"＋ Add to-do"** at the top right (it reads "Close the form" while the form is open).
2. A search box "Find a to-do" and a white "Filters" button. The filters card has Status (Open/All), Assigned to, Type, Priority and Sort (Newest first / Oldest first).
3. Count tiles: **To-dos pending** · **To-dos done**.
4. Chips, and a few white helper buttons.
5. **To-do cards** (white). Each card shows:
   - pills: red "Overdue", grey "Recurring (N accounts)"
   - the title (20px bold) and the account
   - "Assigned to: **Name**" and "Due: **Nov 7**"
   - a row of white buttons: **Edit · In Progress · Done**
   - "**Why:** …" and a "Latest update" box with a Save button

### Sub Center (`/sub-center`)

**Tabs:** Subs · Sub Schedules · Coverage · Insurance · Activity Log.

**Subs** (inner title "Subcontractors"):
1. Green "＋ Add subcontractor" at the top right.
2. Inner tabs: **Subcontractors · Service Log**.
3. Search box: "Find a sub".
4. Three count tiles: **Active** (green) · **High risk** (red when above 0) · **No schedule** (blue).
5. White "Filter and sort" button, a quiet "Clear filters", and a muted "Showing 18 of 18 subcontractors".
6. **Sub cards**. Each card shows:
   - the company name (card title), with the **score pill** on the right
   - the contact name
   - "**8.7 / 10** · 6 accounts · 1 complaints"
   - optionally, "Sub revenue $… · CW revenue $…"
   - a row of pills: insurance, schedule ("Has Schedule" green / "No Schedule" yellow), and "Status: Active"
   - a green **"Open"** button (plus a white "Add schedule" when there is none)
   - Score pill colors: Excellent and Good are green, Needs Attention is yellow, High Risk is red.
7. On desktop it is a table with columns Company · **Score** (the "8.7 / 10" line, the pill and the insurance badge) · Revenue · Accounts and complaints · Schedule · Status · Action.
8. The dashed "Money hidden · tap to show" bar.

**Insurance** ("Waiting for approval, expiring and expired"):
1. A **"Waiting for approval (N)"** card, when any exist. Each row has an uploaded COI with Approve / Reject.
2. An **"Insurance expiring / expired"** card listing sub cards. Each has:
   - the name and company
   - a pill: "Insurance expiring" (yellow) or "Insurance expired" (red)
   - "Expires Nov 20" in bold
   - a green **"Open sub"** button
   - When nothing is due, the card shows "All good · No insurance expires in the next 30 days."
3. A fold-out list of subs with no insurance on file.

**Coverage** ("Towns/cities and zip codes serviced by each subcontractor, based on currently active accounts."):
1. Tabs: **By Sub · By Town · Map**.
2. A search box: "Search town, zip, or sub name".
3. One card per sub (or per town), with an "N accounts" pill on the right. Inside are two tag lists, **Towns / Cities** and **Zip Codes**: small read-only tags, and a match gets a darker bold underline.

### Sub detail page (`/subcontractors/[id]`)

The navy bar shows the company name and an Edit button. A ⋯ menu has Edit, Print and Refresh. The subtitle is the contact name. Then:
1. A row of three pills: status ("Active"), **score band** ("Excellent", "Good", "Needs Attention" or "High Risk"), and "Insurance: OK".
2. An "Invite to portal" card.
3. An **Insurance (COI)** card: the date, the file, "Upload COI", and Approve / Reject.
4. Stat boxes (2 across, 4 from 900px): Active Accounts · Past Accounts · Monthly Revenue · Monthly Sub Pay (70%) · We keep (Gross Margin) · Open Complaints · Valid Complaints.
5. **"Automatic Performance Score"** card, with the band pill on the right:
   - Score **"8.7 / 10"**, Performance, Open Complaints, Avg Visit Condition, Accounts Assigned, Last Activity
   - a muted "Score logic" sentence (see the warning in section 7)
6. Subcontractor Details card, then Current Accounts, Past / Cancelled Accounts, Recent Complaints and the Email log.

### Complaints (`/complaints`)

1. Green "＋ Add complaint" at the top right.
2. Search box: "Find a complaint".
3. Three count tiles: **Open** (red when above 0) · **To review** (blue) · **Closed** (grey).
4. Complaint cards. Each has:
   - the account name, with a status pill on the right
   - "Oct 30, 2026 · Restrooms"
   - the description (2 lines at most)
   - a priority pill and a grey validity pill ("Needs Review")
   - a photo count line
   - an "Open" button
   - a "Pin to board" button

### Visits (`/visits`)

1. A full-width green **"＋ Add visit"** button at the top, and a ⋯ menu with Print.
2. Three count tiles: **This month** (blue) · **Need follow-up** (red when above 0) · **All visits** (grey).
3. Search box: "Find a visit".
4. Visit cards. Each has:
   - the account name, with a **condition pill** on the right
   - "Oct 28, 2026 · Inspection · Manager name"
   - "Sub: Name" and "Follow-up: …"
   - notes (2 lines at most)
   - a green "Open" button

### Extra Jobs (`/extra-jobs`)

1. Green "＋ Extra job" at the top right.
2. The gold rule box: **"Extra jobs not in the app don't get paid."**
3. A white "Extra jobs to pay" button.
4. A search field "Find an extra job", with the hint "Job number, Customer WO #, Estimate #, account, the job or the sub."
5. **Tabs:** Set up (N) · Ready to invoice (N) · Cancelled (N) · All (N).
6. Job cards: white, 14px corners, 2px soft border and a **12px colored left edge**. The edge is blue `#1f6fd0` while set up, green `#3b6d11` when done, and grey `#9aa9bd` when cancelled (on a `#f6f7f9` card). Each card shows:
   - "EJ-1042 · WO 5531" (15px muted), an "Estimate" badge, and a status pill on the right
   - the account name
   - what the job is
   - "Nov 4 · Sub name · $350"

**The form** ("Extra job", subtitle "Set it up here so it gets paid."):
1. Account (search and pick).
2. **How it came in**: chips Call · Text · Email · Portal.
3. "What is the job?" (hint: "What the sub has to do. This prints on the work order.")
4. Date.
5. Customer price ($).
6. Sub (or an In-house option). For In-house, "Who did it" shows: crew names, no sub pay.
7. Sub pay ($).
8. "Who sold it" (hint: they get the 10% one-time commission).
9. Customer WO #.
10. Estimate # ("From Markate. Office only.").
11. Approved estimate (a white "📷" upload button).
12. A green **Save** in the bottom bar.

### Supplies (`/supplies`)

The home screen is **six big white tiles**: 150px tall, 18px corners, shadow, a 48px emoji icon, a 22px/900 label and a muted 15px detail line. A red round count sits in the top right corner when something waits on the office.
1. 📥 **New orders**: "OK or No", with a red count.
2. 🚚 **On the way**: "Tap when it came", with a calm count.
3. 📦 **Stock**: "3 to reorder" or "Warehouse and sites".
4. ✅ **What a site can order**: "Pick the site on Crew Link".
5. 📞 **Order for a site**: "From a call or text".
6. ⋯ **More**: All orders, Wrong amounts and still coming, Products, Stock came in, Crew requests.

**New orders**: one white card per order. Each card has:
- the **site name**, 26px bold
- who sent it, and a red **"Late"** pill
- the items list
- two big buttons, 76px tall with 24px/900 text: **green "✓ OK"** and **white "✗ No"** with a red outline and red text
- links: "OK, another way" · "Change amounts first" · print · download
- When "How does it get there?" is asked, blue choice buttons appear, and the suggested one has a double ring.

**On the way**: the same cards, with "⏳ Still coming: …" when anything is back-ordered, and one big **green "It came"** button plus a "Something is missing" link.

**Stock**: count tiles **Reorder** (red when above 0) · **This month** ($ spent, blue). Then the warehouse shelves (picture tiles with a count and big − / ＋), sites, a "📥 Stock came in" sheet, and a **History** card.

### Crew Link

**Staff page** (`/crew-link`): this page uses Tailwind classes.
1. "Crew Link" title, with the muted line "Find an account's checklist, edit it, and share it with the crew." and a white "📋 Submitted" button on the right.
2. A search box: "🔍 Search accounts by name or address".
3. Three pill filters, 48px tall with 2px borders:
   - **Set up N** · **Not set up N** · **All accounts N**
   - selected: solid blue-700 `#1d4ed8` with white text
   - normal: white with a slate-300 `#cbd5e1` border and slate-800 `#1e293b` text
4. Account cards, 2 across from 640px. Each card has:
   - the bold name and muted address
   - a status line: green-700 `#15803d` "✅ Checklist set up" (or slate-400 `#94a3b8` when not set up)
   - "Last checklist: …"
   - a small "📋 Submitted" button
5. Tapping a card opens the checklist editor (share link, QR, the checklist rows) and the account history.

**The crew's phone screen** (`/porter/[code]`): big full-width buttons, with English in big type and Spanish under it in grey: **Checklist · Supplies · Problem · Supplies arrived · Case empty**. A route crew sees "Tonight's list" tabs: rows to tick, row photos, dumpster buttons, urgent requests and the night note. The camera button is large.

### Equipment (`/equipment`)

This page uses Tailwind classes.
1. Green "＋ Add equipment" at the top right.
2. **Four light-green tiles**: 64px tall, 2xl corners (16px), `#EAF3DE` background, `#27500A` text, 20px bold, emoji on the left. They are **🚐 Vehicles · 🔩 Parts & stock · 👥 Staff & PINs · Set up tablet**: 2 across on a phone, 4 on desktop.
3. A big search box, 64px tall with 16px corners: "🔍 Find equipment".
4. Filter pills, 52px tall:
   - **All in use · Good · Needs repair · Lost · Retired**, each with a colored dot and a count
   - selected: `#E6F1FB` with a `#0C447C` border and text
5. **Equipment cards**, 1/2/3 across. Each is white with **24px corners and a 4px colored border**:
   - **Good:** green-300 `#86efac` border
   - **Needs repair:** amber-400 `#fbbf24`
   - **Lost:** red-400 `#f87171`
   - **Retired:** gray-300 `#d1d5db`
   - Inside: a photo 176px tall, then the serial number (30px, black weight), the name, a status chip (for example green-100 `#dcfce7` with green-800 `#166534` text and a green dot), and a "Where" line (red-700 `#b91c1c` bold when overdue).

**Vehicles** (`/equipment/vehicles`, back link "Equipment"):
- Green "＋ Add vehicle", a search box and filter pills.
- Vehicle cards with a 160px photo, the name (24px black weight), plate and mileage, and an **oil change due** strip with a green, yellow or red dot.

**Equipment Check tablet** (`/equipment-check/[key]`, a full-screen page for a shared tablet):
- **Header:** blue-700 `#1d4ed8`, white text, "Equipment Check", with small white-tint buttons for Equipment and Supplies.
- **Steps:**
  1. "Who are you?" (big white name buttons)
  2. "Enter your PIN" (big keypad; first time: "Create your PIN")
  3. "What did you use?"
  4. "How did you leave it?": **Good** (green-600 `#16a34a`) · **Damaged or not working** (yellow-400 `#facc15`) · **Lost** (red-600 `#dc2626`)
  5. "TAKE PICTURE" and "Notes / Comments"
  6. **SEND**, then "Done! Thank you"
- For a vehicle it asks "Mileage?" ("The number on the dashboard"), then "Yes, it's right" or "Fix it".

### Map (`/map`, "Account Map")

- **Subtitle:** "Blue pins are accounts. Orange pin is selected. Green pin is your location."
- **Search box:** "Search account, address, manager, or sub", with a white "Filter" button.
- **Map:** a large Google map with **blue** account pins, an **orange** selected pin and a **green** "you are here" pin.
- **Selected account:** under the map, a card with the account name and a yellow "Selected" pill on the right, plus its details and buttons.

### Overview (`/overview`)

1. A white "Print" button.
2. **"How are we doing?"**: a white box with a 2px `#c9d6e4` border and 16px corners, holding short summary lines.
3. **"Needs attention"**: the same box style. Inside are rows with 2px soft borders and 12px corners; each has a 20px line of text and a green **"See it"** button (56px tall).
4. Count tiles: To-dos pending · To-dos done this week (green) · Open complaints (red when above 0) · Accounts need you · Visits this month (blue) · Active accounts (green). A small red line under a number reads, for example, "3 overdue".
5. Sections, each with a heading and a **bar chart by month**. Bars are `#1f63a8` with 4px top corners; the current month is striped. The sections are:
   - Complaints logged each month, plus "Latest complaints"
   - Visits logged each month
   - New accounts started each month, plus "Active accounts with no sub"
   - Each section ends with a white button to its page.

### Reports (`/reports`)

1. A filter card with four columns on desktop:
   - **Report Type**: Overview · YTD Started Accounts · YTD Cancelled Accounts · Manager Summary · Complaints · Sales & Commissions · Visits · Last Visit by Account · Account Management Performance
   - **Date Range**: YTD · This Month · This Quarter · Custom
   - Start Date and End Date
   - then more drop-downs (manager, sub, status) and min / max monthly revenue
2. A report header, also the print header: the logo on the left; on the right, "Cleaning World", "Operations & Quality Report", the report name, the date range and "Printed on …".
3. Stat boxes, then white cards with tables (for example "Visits", "Last Visit by Account", "Account Management Performance").

### Email log (`/email-log`)

- **Subtitle:** "Every email the app sends: sub packets, documents, transfer proposals, offers, Welcome Packets, portal invites…"
- **Filters:** Search ("Who it went to, subject, account, sub, who sent it") · Type · Sub.
- **Table:** columns **Date / time · To · Type · Account · Sent by · Status**.
  - The "To" cell is a link; the sub's name follows in muted text.
  - A text message shows "· text" after its type.
  - Status is a green "Sent" or red "Failed" pill.
- **Opening a row:** a sheet with the subject as title, "Type · time" under it, and the email as it was sent (in a bordered frame).

### Help (`/help`)

1. At the top, a full-width green button: "How it works: new accounts, updates and supply orders".
2. A white card with:
   - a small bold eyebrow line
   - the title "Help" and the subtitle "Find what you want to do. Follow the steps."
   - a white "Back to Dashboard" button
   - an "About" box
   - language buttons: **English · Español** (staff); subs also get Português
3. The **green rule box**: "If it's not in the app, it does not exist!"
4. A **Quick start** card with a numbered list of steps.
5. Search box: "What do you want to do? (for example: supplies)".
6. Groups, each with an uppercase heading in muted letters: **Daily · Work · Office · Settings**. Each group has a grid of "I want to…" cards with a title, numbered steps (key words in dark green), and a light-green **tip** box (`#eaf3de`, 14px corners).
7. In Daily, a "Who does what: a new account" card follows "Add a new account". It reads "A new account has 8 steps. You see them as the pizza tracker on the account page and on the Board. The big green button is always the step it is on…".

---

## 6. Raw CSS and Tailwind classes

Copied from the code. The overrides from the redesign block are already applied where both exist; the full original rules are in `app/globals.css`.

### Tokens (final values)

```css
:root {
  --ui-paper: #f6fafe;
  --ui-surface: #ffffff;
  --ui-surface-2: #eef4fb;
  --ui-ink: #10233f;
  --ui-muted: #52627a;
  --ui-line: #c9d6e4;
  --ui-line-soft: #e3ebf4;
  --ui-warn: #8a5300;
  --ui-warn-soft: #fdf0dc;
  --ui-bad: #b3261e;
  --ui-bad-soft: #fce7e5;
  --ui-off: #52627a;
  --ui-off-soft: #eceff3;
  --ui-shadow: 0 1px 2px rgba(16, 35, 63, 0.05), 0 8px 24px rgba(16, 35, 63, 0.07);
  --ui-r-panel: 18px;
  --ui-r-pill: 999px;
  --ui-tap: 48px;
  --ui-tap-main: 56px;
  --ui-gap: 16px;
  --ui-font: ui-rounded, "Segoe UI", system-ui, -apple-system, Arial, sans-serif;

  /* Redesign block (these win) */
  --ui-navy: #0c447c;
  --ui-navy-ink: #093560;
  --ui-green: #3b6d11;
  --ui-green-press: #2f570d;
  --ui-green-soft: #eaf3de;
  --ui-green-ink: #27500a;
  --ui-sky-soft: #e6f1fb;
  --ui-brand: #0c447c;
  --ui-brand-ink: #0c447c;
  --ui-brand-soft: #e6f1fb;
  --ui-good: #3b6d11;
  --ui-good-soft: #eaf3de;
  --ui-r-control: 14px;
}

body {
  background: linear-gradient(180deg, #eef7ff 0%, #f8fbff 45%, #ffffff 100%);
}

.cw-page-card {
  background: rgba(255, 255, 255, 0.78);
  border-radius: 24px;
  padding: 22px;
  border: 1px solid #dbeafe;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
}
main.cw-page-card { margin: 12px; }
@media (min-width: 900px) { main.cw-page-card { margin: 24px; } }
```

### Navy top bar

```css
.cw-topbar {
  position: sticky; top: 0; z-index: 40;
  background: var(--ui-navy);
  color: #ffffff;
  font-family: var(--ui-font);
  box-shadow: 0 2px 10px rgba(9, 53, 96, 0.25);
}
.cw-topbar-row { display: flex; align-items: center; gap: 10px; min-height: 64px; padding: 8px 12px; }
@media (min-width: 900px) { .cw-topbar-row { padding: 8px 24px; } }
.cw-topbar-logo {
  width: 60px; height: 44px; padding: 4px;
  border-radius: 10px; background: #ffffff;
}
.cw-topbar-brand { font-size: 14px; font-weight: 700; line-height: 1.2; opacity: 0.9; }
.cw-topbar-page  { font-size: 20px; font-weight: 800; line-height: 1.15; }
.cw-topbar-btn {
  min-width: 48px; min-height: 48px; padding: 0 12px; gap: 6px;
  border: 2px solid rgba(255, 255, 255, 0.45);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.12);
  color: #ffffff; font-size: 18px; font-weight: 800;
}
.cw-topbar-btn:active { transform: scale(0.96); background: rgba(255, 255, 255, 0.28); }
.cw-topbar-badge {
  min-width: 24px; height: 24px; padding: 0 6px;
  border-radius: 999px; background: var(--ui-bad);
  color: #ffffff; font-size: 15px; font-weight: 800;
}
```

### Sidebar

```css
.cw-side {
  position: fixed; top: 0; bottom: 0; left: 0; z-index: 50;
  display: flex; flex-direction: column;
  width: min(86vw, 300px);                 /* phone slide-in */
  background: var(--ui-navy);
  color: #ffffff;
  font-family: var(--ui-font);
  box-shadow: 4px 0 24px rgba(9, 53, 96, 0.35);
}
.cw-side-top {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  min-height: 64px; padding: 8px 8px 8px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.18);
}
.cw-side-title { font-size: 18px; font-weight: 800; }
.cw-side-scroll { flex: 1; overflow-y: auto; padding: 8px 10px; }
.cw-side-group + .cw-side-group {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.14);
}
.cw-side-heading {
  margin: 0; padding: 6px 12px 2px;
  font-size: 13px; font-weight: 800;
  letter-spacing: 0.08em; text-transform: uppercase; opacity: 0.75;
}
.cw-side-link {
  display: flex; align-items: center; gap: 12px; width: 100%;
  min-height: 48px; padding: 8px 12px;
  border: 0; border-radius: 12px;
  background: transparent; color: #ffffff;
  font-size: 17px; font-weight: 700; line-height: 1.2;
}
.cw-side-link:hover { background: rgba(255, 255, 255, 0.14); }
.cw-side-link-on, .cw-side-link-on:hover { background: #ffffff; color: var(--ui-navy); }
.cw-side-icon { width: 24px; height: 24px; }   /* outline icon, stroke 2, round caps */
.cw-side-foot { padding: 8px 10px 10px; border-top: 1px solid rgba(255, 255, 255, 0.18); }
.cw-side-alert { background: #c62828; color: #ffffff; }   /* "⚠ 2" on Accounts center */

@media screen and (min-width: 900px) {
  .cw-side { width: 248px; box-shadow: none; }
  .cw-app-container:has(.cw-side) { padding-left: 248px; }
  .cw-side-mini { width: 72px; }                          /* "Icons only" */
  .cw-app-container:has(.cw-side-mini) { padding-left: 72px; }
}
```

### Buttons

```css
.ui-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 48px; padding: 8px 20px;
  border-radius: 14px; border: 2px solid transparent;
  font-weight: 700; line-height: 1.2;
  transition: background-color 0.12s ease, transform 0.08s ease, box-shadow 0.12s ease;
}
.ui-btn:active:not(:disabled) { transform: scale(0.97); }
.ui-btn:disabled { opacity: 0.55; }

.ui-btn-main    { min-height: 56px; background: #3b6d11; color: #ffffff; font-size: 20px; }
.ui-btn-main:hover:not(:disabled) { background: #2f570d; }
.ui-btn-second  { background: #ffffff; color: #0c447c; border-color: #0c447c; }
.ui-btn-second:hover:not(:disabled) { background: #e6f1fb; }
.ui-btn-quiet   { background: transparent; color: #0c447c; }
.ui-btn-quiet:hover:not(:disabled) { background: #eef4fb; }
.ui-btn-problem { min-height: 56px; background: #b3261e; color: #ffffff; font-size: 20px; }
.ui-btn-danger  { min-height: 56px; background: #b3261e; color: #ffffff; }
.ui-btn-delete  { background: #ffffff; color: #b3261e; border: 2px solid #b3261e; }
.ui-btn-icon    { width: 48px; min-width: 48px; padding: 0; }   /* the ⋯ button */

/* Add buttons at the top of a page (always the green main button with a +) */
.ui-page-add { order: 3; flex: 1 0 100%; display: flex; flex-direction: column; gap: 8px; }
@media (min-width: 640px) { .ui-page-add { order: 0; flex: 0 0 auto; flex-direction: row; margin-left: auto; } }
```

Note: a `.ui-btn-main` button inside the bottom bar, or in a page's top Add area, keeps the 56px height. In body text the 20px size comes from the main rule above.

### Pills, chips, tabs, count tiles

```css
.ui-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 12px 4px 8px; border-radius: 999px;
  font-size: 16px; font-weight: 800; line-height: 1.3;
}
.ui-pill .ui-icon { width: 20px; height: 20px; }
.ui-pill-done      { background: #eaf3de; color: #3b6d11; }
.ui-pill-waiting   { background: #fdf0dc; color: #8a5300; }
.ui-pill-needs-you { background: #fce7e5; color: #b3261e; }
.ui-pill-off       { background: #eceff3; color: #52627a; }

.ui-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ui-chip {
  min-height: 48px; padding: 8px 18px;
  border: 2px solid #c9d6e4; border-radius: 999px;
  background: #ffffff; color: #10233f; font-weight: 700;
}
.ui-chip[aria-pressed="true"] { border-color: #0c447c; background: #e6f1fb; color: #0c447c; }

.ui-tabs { display: flex; gap: 8px; overflow-x: auto; border-bottom: 2px solid #e3ebf4; }
.ui-tab {
  min-height: 48px; padding: 8px 16px;
  border: 0; border-bottom: 4px solid transparent; margin-bottom: -2px;
  background: transparent; color: #52627a; font-weight: 700;
}
.ui-tab[aria-selected="true"] { color: #0c447c; border-bottom-color: #0c447c; }

.ui-counts { display: grid; grid-template-columns: repeat(auto-fit, minmax(96px, 1fr)); gap: 8px; }
.ui-count {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  min-height: 88px; padding: 10px 4px;
  border: 3px solid transparent; border-radius: 18px;
}
.ui-count-number { font-size: 32px; font-weight: 800; line-height: 1.1; }
.ui-count-label  { font-size: 16px; font-weight: 800; line-height: 1.2; text-align: center; }
.ui-count-good { background: #eaf3de; color: #27500a; }
.ui-count-bad  { background: #fce7e5; color: #b3261e; }
.ui-count-off  { background: #eceff3; color: #52627a; }
.ui-count-info { background: #e6f1fb; color: #0c447c; }
.ui-count[aria-pressed="true"] { border-color: currentColor; }
```

### Cards, inputs, tiles, the blue banner

```css
.ui-card {
  padding: 16px;
  border: 1px solid #c9d6e4; border-radius: 18px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(16, 35, 63, 0.05), 0 8px 24px rgba(16, 35, 63, 0.07);
}
a.ui-card:hover, button.ui-card:hover { border-color: #0c447c; }
.ui-card-title { margin: 0; font-size: 20px; font-weight: 800; line-height: 1.25; }
.ui-card-text  { margin: 4px 0 0; color: #52627a; }

.ui-acct-list { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 800px)  { .ui-acct-list { grid-template-columns: repeat(2, 1fr); } }
@media (min-width: 1250px) { .ui-acct-list { grid-template-columns: repeat(3, 1fr); } }
.ui-acct {
  display: flex; flex-direction: column; gap: 8px; padding: 16px;
  border: 2px solid #c9d6e4; border-radius: 18px; background: #ffffff;
}
.ui-acct-problem { border-color: #b3261e; }
.ui-acct-name { margin: 0; font-size: 21px; font-weight: 800; line-height: 1.25; }
.ui-acct-line { margin: 0; color: #52627a; }
.ui-acct-wrong { margin: 0; color: #b3261e; font-weight: 700; }

.ui-input {
  min-height: 48px; padding: 10px 14px;
  border: 2px solid #c9d6e4; border-radius: 14px;
  background: #ffffff; color: #10233f;
}

.ui-stat { padding: 14px 16px; border: 1px solid #c9d6e4; border-radius: 18px; background: #ffffff; }
.ui-stat-label { font-size: 16px; color: #52627a; }
.ui-stat-value { margin: 4px 0 0; font-size: 22px; font-weight: 800; }

/* Light-green action tiles (account page) */
.ui-acttiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
@media (min-width: 800px) { .ui-acttiles { grid-template-columns: repeat(3, 1fr); } }
.ui-acttile {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
  min-height: 112px; padding: 14px 8px;
  border: 2px solid transparent; border-radius: 18px;
  background: #eaf3de; color: #27500a; text-align: center;
}
.ui-acttile:hover { border-color: #3b6d11; }
.ui-acttile-icon  { width: 36px; height: 36px; }
.ui-acttile-label { font-size: 19px; font-weight: 800; line-height: 1.2; }
.ui-acttile-detail { font-size: 16px; line-height: 1.2; }

/* The blue banner: Next cleaning */
.ui-next { padding: 16px; border-radius: 18px; background: #e6f1fb; color: #0c447c; }
.ui-next-label { margin: 0; font-size: 16px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
.ui-next-day   { margin: 2px 0 0; font-size: 28px; font-weight: 800; line-height: 1.15; }
.ui-next-time  { margin: 2px 0 10px; font-size: 20px; font-weight: 700; }
.ui-next-who   { margin: 0; color: #10233f; }
.ui-next-snapshot { margin-top: 14px; padding-top: 12px; border-top: 1px solid color-mix(in srgb, #0c447c 25%, transparent); color: #10233f; }

/* Sub score alert card (top of Accounts Center) */
.ui-score-alert-card {
  display: flex; align-items: center; gap: 14px; padding: 14px 16px;
  border: 2px solid #c62828; border-radius: 18px;
  background: #fdecea; color: #10233f; font-size: 18px;
}
.ui-score-alert-icon { width: 44px; height: 44px; border-radius: 50%; background: #c62828; color: #fff; font-size: 28px; font-weight: 800; }
```

### Pizza tracker

```css
/* Horizontal bar (New accounts cards, board papers) */
.cw-pizza-bar { display: flex; gap: 2px; width: 100%; }
.cw-pizza-seg { flex: 1; height: 8px; border-radius: 2px; background: #c9d6e4; }
.cw-pizza-seg.is-done { background: #3b6d11; }
.cw-pizza-seg.is-now  { background: #0c447c; }   /* #b3261e when stuck */

/* Vertical list (account page, opened paper) */
.cw-pizza-row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 40px; }
.cw-pizza-row:not(:last-child)::after { content: ""; position: absolute; left: 13px; top: 30px; bottom: -10px; width: 2px; background: #c9d6e4; }
.cw-pizza-row.is-done:not(:last-child)::after { background: #3b6d11; }
.cw-pizza-mark { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #c9d6e4; background: #fff; color: #fff; font-size: 16px; font-weight: 900; }
.cw-pizza-row.is-done .cw-pizza-mark { border-color: #3b6d11; background: #3b6d11; }          /* white ✓ */
.cw-pizza-row.is-now  .cw-pizza-mark { border: 0; background: #0c447c; box-shadow: 0 0 0 5px #e6f1fb; }
.cw-pizza.is-red .cw-pizza-row.is-now .cw-pizza-mark { background: #b3261e; box-shadow: 0 0 0 5px #fce7e5; }
.cw-pizza-name { font-size: 16px; color: #52627a; }
.cw-pizza-row.is-done .cw-pizza-name { color: #27500a; font-weight: 600; }
.cw-pizza-row.is-now  .cw-pizza-name { color: #10233f; font-size: 18px; font-weight: 800; }
.cw-pizza-who { font-size: 15px; font-weight: 700; color: #0c447c; }   /* "with Name" */
```

### Pin Board (`app/board/board.module.css`)

```css
.motto {
  padding: 14px 22px 10px;
  background: #fffdf5; border: 1px solid #e6dcc0;
  box-shadow: 0 3px 8px rgba(60, 40, 10, 0.25);
  transform: rotate(-1deg);
  font-weight: 800; font-size: 18px; color: #0c447c; text-align: center;
}
.motto::before {   /* its red pin */
  top: -8px; left: 50%; width: 16px; height: 16px; margin-left: -8px; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #ff8a80, #c62828 60%, #8e1b1b);
  box-shadow: 0 2px 3px rgba(0, 0, 0, 0.4);
}
.tvButton { width: 100%; min-height: 76px; font-size: 26px; }

.frame {
  padding: 14px; border-radius: 18px;
  background: linear-gradient(135deg, #8a5a2b 0%, #a9713a 22%, #7a4d22 48%, #a06a35 74%, #6f451d 100%);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,0.12), inset 0 0 12px rgba(0,0,0,0.45), 0 8px 24px rgba(40,25,5,0.3);
}
.cork {
  display: flex; flex-direction: column; gap: 14px; padding: 16px; border-radius: 8px;
  background-color: #c79a63;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(92,58,22,0.35) 0 1.5px, transparent 2px),
    radial-gradient(circle at 70% 60%, rgba(255,226,170,0.35) 0 1.5px, transparent 2px),
    radial-gradient(circle at 45% 80%, rgba(92,58,22,0.28) 0 1px, transparent 1.6px),
    radial-gradient(circle at 85% 15%, rgba(255,226,170,0.28) 0 1px, transparent 1.6px),
    linear-gradient(135deg, #cfa36c, #bf8f56);
  background-size: 23px 23px, 31px 31px, 17px 17px, 27px 27px, 100% 100%;
  box-shadow: inset 0 0 18px rgba(60, 35, 5, 0.55);
}
.row { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); }

.square {
  display: flex; flex-direction: column; gap: 10px; min-height: 170px; padding: 10px;
  border: 2px dashed rgba(255,255,255,0.55); border-radius: 10px;
  background: rgba(255,255,255,0.08);
}
.squareOver { background: rgba(255,255,255,0.34); border-color: #ffffff; border-style: solid; }  /* while dragging over */
.squareMine { border-color: #ffe27a; border-style: solid; }
.squareName {
  margin: 0; padding: 4px 12px; border-radius: 6px;
  background: #fffdf5; box-shadow: 0 2px 4px rgba(60,40,10,0.3);
  font-size: 18px; font-weight: 800; color: #10233f;
}
.squareCount {
  min-width: 34px; padding: 2px 10px; border-radius: 999px;
  background: rgba(16,35,63,0.82); color: #ffffff; font-weight: 800; text-align: center;
}
.papers { display: flex; flex-wrap: wrap; align-content: flex-start; gap: 14px 10px; padding-top: 6px; }
.emptySquare { margin: auto; color: rgba(255,255,255,0.85); font-weight: 700; text-shadow: 0 1px 2px rgba(60,35,5,0.6); }

.paper {
  position: relative; flex: 1 1 150px; max-width: 240px; min-height: 96px;
  padding: 18px 12px 12px; border: 0; border-radius: 2px;
  background: #ffffff; box-shadow: 0 4px 9px rgba(50,30,5,0.38);
  color: #10233f; text-align: left;
}
.paper:hover { box-shadow: 0 7px 14px rgba(50,30,5,0.45); }
.account   { background: #ffffff; }
.extra     { background: #d6e9ff; }
.complaint { background: #ffd9e6; }
.supply    { background: #d9f2cf; }
.note      { background: #fff3a0; box-shadow: 0 5px 10px rgba(50,30,5,0.4); }
.updateNote { background: #c9ecc4; }

.pin { position: absolute; top: -9px; left: 50%; width: 20px; height: 20px; margin-left: -10px; border-radius: 50%; box-shadow: 0 3px 4px rgba(0,0,0,0.45); }
.pinRed   { background: radial-gradient(circle at 35% 30%, #ff9a8f, #d32f2f 58%, #8e1b1b); }
.pinGreen { background: radial-gradient(circle at 35% 30%, #b9f0a4, #2e8b2e 58%, #1b5a1b); }

.kind  { display: block; font-size: 13px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; color: #3d4f69; }
.title { margin-top: 2px; font-size: 18px; font-weight: 800; line-height: 1.25; -webkit-line-clamp: 3; }
.note .title { font-size: 26px; font-weight: 700; line-height: 1.1; }   /* + Caveat 700 */
.badge { margin-top: 6px; padding: 1px 10px; border-radius: 999px; background: rgba(16,35,63,0.86); color: #fff; font-size: 15px; font-weight: 800; }
.who   { margin-top: 6px; font-size: 14px; font-weight: 700; color: #1b5a1b; }
.bar     { height: 10px; margin-top: 8px; border-radius: 999px; background: #dfe6ee; }
.barFill { height: 100%; border-radius: 999px; background: #3b6d11; }
.barText { margin-top: 2px; font-size: 13px; font-weight: 700; color: #3d4f69; }

/* Up too long: yellowed, curled corner, red days tag */
.old { background-image: linear-gradient(160deg, rgba(214,170,60,0.16), rgba(190,140,40,0.34)); border-bottom-right-radius: 26px 22px; }
.old::after { right: 0; bottom: 0; width: 26px; height: 22px; border-top-left-radius: 14px;
  background: linear-gradient(135deg, #f1e3b4 0%, #d9bf7a 55%, rgba(120,85,20,0.55) 100%); box-shadow: -2px -2px 4px rgba(60,40,5,0.3); }
.daysTag { top: -8px; right: -6px; padding: 2px 9px; border-radius: 6px; background: #c62828; color: #fff; font-size: 14px; font-weight: 800; transform: rotate(4deg); }
.statusTag  { padding: 2px 8px; border-radius: 6px; background: #e65100; color: #fff; font-size: 13px; font-weight: 800; }
.statusLine { margin-top: 4px; font-size: 13px; font-weight: 800; color: #6a3a00; }
.overdueCorner { right: 0; bottom: 0; border-width: 0 0 26px 26px; border-color: transparent transparent #c62828 transparent; }
.doneCheck { top: -10px; left: -8px; width: 30px; height: 30px; border-radius: 50%; background: #2e7d32; color: #fff; font-size: 18px; font-weight: 800; }
.flowRed { outline: 3px solid #b3261e; outline-offset: 1px; }

/* A full square: the pile */
.pileSheet:nth-child(1) { background: #fff3a0; transform: rotate(-4deg) translate(-4px, 7px); }
.pileSheet:nth-child(2) { background: #d6e9ff; transform: rotate(3deg) translate(5px, 5px); }
.pileSheet:nth-child(3) { background: #fffdf5; }
.pileCount { min-width: 56px; height: 56px; border-radius: 999px; background: #10233f; color: #fff; font-size: 24px; font-weight: 800; }

/* The opened paper (pop-up) */
.bigCard  { padding: 18px 18px 22px; border-radius: 6px; box-shadow: 0 6px 14px rgba(40,24,6,0.28); color: #10233f; }
.bigType  { font-size: 14px; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.75; }
.bigTitle { margin: 6px 0 10px; font-size: 26px; font-weight: 800; line-height: 1.2; }
.bigFacts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 18px; }
.bigFacts dt { font-weight: 800; }
.statusButtons { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.jobDoneButton { width: 100%; min-height: 68px; font-size: 24px; }
.give { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); }
```

### Tailwind classes (pages that use them)

```text
Crew Link filter pill:
  min-h-[48px] rounded-full border-2 px-4 text-base font-bold
  selected:  border-blue-700 bg-blue-700 text-white        (#1d4ed8)
  normal:    border-slate-300 bg-white text-slate-800 hover:bg-slate-100

Crew Link card status line:
  mt-2 text-base font-bold  +  text-green-700 (set up) | text-slate-400 (not)

Crew Link "Submitted" small button:
  inline-flex min-h-[40px] items-center rounded-lg border-2 border-slate-300 bg-white px-3 text-sm font-bold text-slate-800

Equipment big tile (tone "plain"):
  flex min-h-[64px] items-center justify-center gap-3 rounded-2xl px-5 text-xl font-bold shadow-sm
  bg-[#EAF3DE] text-[#27500A] border-2 border-transparent hover:border-[#3B6D11]
  (tone "primary"/"green": bg-[#3B6D11] text-white hover:bg-[#2F570D])

Equipment search:
  min-h-[64px] w-full rounded-2xl border-2 border-gray-300 bg-white px-5 text-xl focus:border-[#0C447C]

Equipment filter pill:
  flex min-h-[52px] items-center gap-2 rounded-full border-2 px-4 text-lg font-bold
  selected: border-[#0C447C] bg-[#E6F1FB] text-[#0C447C]
  normal:   border-gray-300 bg-white text-gray-800 hover:bg-gray-100

Equipment card:
  overflow-hidden rounded-3xl border-4 bg-white shadow-sm hover:shadow-md
  + border-green-300 | border-amber-400 | border-red-400 | border-gray-300
  photo: h-44 w-full ; body: space-y-2 p-4
  serial: text-3xl font-black text-gray-900 ; name: text-lg font-semibold text-gray-600

Equipment status chip:
  inline-flex items-center gap-2 rounded-full border px-3 py-1 text-base font-bold
  good:    bg-green-100 text-green-800 border-green-300, dot bg-green-500
  repair:  bg-amber-100 text-amber-900 border-amber-300, dot bg-amber-500
  lost:    bg-red-100 text-red-800 border-red-300,       dot bg-red-500
  retired: bg-gray-200 text-gray-700 border-gray-300,    dot bg-gray-400

Equipment Check tablet header:
  flex items-center justify-between gap-3 bg-blue-700 px-4 py-3 text-white
  big white button: min-h-[64px] rounded-2xl bg-white text-2xl font-bold text-blue-700 shadow-sm
```

Tailwind hex values used above:

| Class | Hex |
|---|---|
| blue-700 | `#1d4ed8` |
| slate-300 | `#cbd5e1` |
| slate-800 | `#1e293b` |
| slate-400 | `#94a3b8` |
| green-700 | `#15803d` |
| green-100 | `#dcfce7` |
| green-800 | `#166534` |
| green-300 | `#86efac` |
| green-500 | `#22c55e` |
| amber-100 | `#fef3c7` |
| amber-900 | `#78350f` |
| amber-300 | `#fcd34d` |
| amber-400 | `#fbbf24` |
| amber-500 | `#f59e0b` |
| red-100 | `#fee2e2` |
| red-800 | `#991b1b` |
| red-300 | `#fca5a5` |
| red-400 | `#f87171` |
| red-500 | `#ef4444` |
| red-700 | `#b91c1c` |
| gray-200 | `#e5e7eb` |
| gray-300 | `#d1d5db` |
| gray-400 | `#9ca3af` |
| gray-700 | `#374151` |
| gray-800 | `#1f2937` |
| gray-900 | `#111827` |

---

## 7. How the sub score is calculated

Source: `computeSubcontractorScore` and `buildSubcontractorPerformanceMap` in `lib/googleSheets.ts`. The Postgres version (`lib/pg/performance.ts`) feeds the same function, so there is one set of rules.

> **Warning for the video:** the sub page's "Automatic Performance Score" card has a muted line: "Score logic: starts from average visit condition, then subtracts 0.5 for each open complaint." **That sentence is out of date. It is not how the score works.** Don't show or read it. The rules below are what the code does.

### In plain words

1. **Everyone starts at 10.** The score runs from 0 to 10. It started fresh on **August 11, 2026**; older history before that date is not replayed.
2. **Every complaint takes points off.** How many points depends on two things:
   - **How serious it is** (the complaint's Priority):

     | Priority | Points |
     |---|---|
     | Low | 0.5 |
     | Medium | 1.0 |
     | High | 2.0 |
     | Urgent | 2.5 |
     | Blank or unknown | counts as Medium (1.0) |

   - **How many accounts the sub has.** A small sub feels each complaint more than a big one. The points are multiplied by **10 ÷ the sub's active accounts**, but never less than ×0.5 and never more than ×2.0:

     | Active accounts | Multiplier | A High complaint costs |
     |---|---|---|
     | 1 to 5 | ×2.0 | 4.0 points |
     | 8 | ×1.25 | 2.5 points |
     | 10 | ×1.0 | 2.0 points |
     | 20 or more | ×0.5 | 1.0 point |

     "Active" means every account of the sub except those marked Cancelled, Inactive, Lost, Terminated or Closed. An account with a blank status counts as active.
3. **The score comes back up month by month.** The score is worked out one calendar month at a time, from August 2026 to this month:
   - **A month with a new complaint:** the points come off, and there is **no recovery** that month.
   - **A month with no new complaint:** the score goes **up by 1.0**.
   - **Slower recovery after a fix:** once a complaint is **closed**, recovery slows to **0.5 a month**. It stays at 0.5 until the score is back at 10, then returns to 1.0 a month.
   - The current month counts as soon as it starts. If no complaint has been filed yet this month, this month's recovery is already added.
   - The score never goes below 0 or above 10. It is rounded to one decimal only at the end.
4. **Which complaints count:**
   - **Validity:** every complaint counts, **except** those marked **Not Valid** (or "No" / "Invalid"). "Valid", "Subjective", "Needs Review" and blank all count.
   - **Who it counts for:** a complaint counts for **the sub who had the account when it was filed**, if the app saved that. Otherwise it counts for the account's current sub. Moving an account to a new sub does not hand the new sub the old complaints.
   - **Complaints from before August 11, 2026:** they count only if they were **still open** on that date. They then count in August 2026. Ones already closed before that date are ignored.
   - Closing a complaint does **not** give the points back. It only switches the recovery to 0.5 a month (rule 3).
5. **What does not change the score:** visit condition ratings. "Avg Visit Condition" shows on the sub page next to the score, but it is not part of it.

### The bands and warnings

| Score | Band | Pill color |
|---|---|---|
| 9.0 – 10 | Excellent | green |
| 8.0 – 8.9 | Good | green |
| 7.0 – 7.9 | Needs Attention | yellow |
| below 7.0 | High Risk | red |

- **Subs list:** the "High risk" count tile counts the subs below 7.
- **Score alert, below 6:**
  - The **Accounts center** item in the sidebar gets a red **⚠ N** badge, and a red alert card appears at the top of Accounts Center listing who dropped and why: open complaints, the latest complaints from the last 90 days, and a low visit rating if the average is under 7.
  - The sub gets **one email** (English, then Spanish): "Your Cleaning World score dropped to 5.4 out of 10", with why and what to do.
  - There is one alert per drop. The sub is alerted again only after the score climbs back to 6 or more and then drops again.
  - The alert leaves the list when someone in the office taps **"Got it"**.
  - Scores are re-checked at most every 10 minutes, when a staff screen asks.

### A worked example (fake data)

"Sparkle Crew" has **5 active accounts**, so complaints are multiplied by ×2.0.

| Month | What happened | Score |
|---|---|---|
| Aug 2026 | nothing | 10 |
| Sep 2026 | one **High** complaint: 2.0 × 2.0 = −4.0 | 6.0 |
| Oct 2026 | one **Medium** complaint (−2.0); the September one is closed this month | 4.0, now below 6: alert and email |
| Nov 2026 | no new complaint; recovery is in slow mode after the close | 4.5 |
| Dec 2026 | no new complaint | 5.0 |

If the same sub had **20 accounts** (×0.5), September would cost only 1.0 (score 9.0) and October 0.5 (score 8.5), so the sub would stay "Good".
