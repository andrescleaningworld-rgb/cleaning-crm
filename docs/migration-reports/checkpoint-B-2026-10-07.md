## Checkpoint B (design system) – 2026-10-07

Time: 0.2 h actual vs 14 h estimate. Areas 0 + B together: 0.7 h vs 20 h. Remaining on the original estimate: about 310 h, but see the pace note. Projected finish: cannot be given while Sheets cannot be read from this computer. Deadline: not set.

Pace note: these two parts were all new files with no data in them. They went much faster than estimated. Areas with data and with large existing screens will not go at this pace, so the estimate is not scaled down yet.

### What changed (plain words)
- A set of shared building blocks for the new look lives in `app/ui/`. No existing screen uses them yet, so nothing looks different in the app today.
- A preview page shows every block in every state with made-up data: **`/design-preview`** (staff login needed; not in the menu).
- The look: bigger text (18px), big buttons (48px, 56px for the main one), one blue main button per screen, status shown as color + word + icon, cards on a phone and a table on a wide screen.
- A word list (`app/ui/words.ts`): button words, what each word means, and the built-in words in English, Spanish and Portuguese.

### What is in the kit
Screen, BigButton, Field / TextAreaField / SelectField, SaveStatus + `useSaveAction()`, ErrorBox, Toast, Card, CardList, SearchBar, FilterChips, StatusPill, EmptyState, Skeleton / SkeletonList, ConfirmSheet, Stepper, PhotoPicker, PersonPicker / AccountPicker, MoreMenu, Tabs, Icon, `friendlyDate()` ("Tue, Oct 7").

### Checks
| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✓ |
| `npm run build` | ✓ |
| `npm run lint` | No new errors (same 10 old ones) |
| Preview at 375 / 768 / 1280 px | ✓ text 18px, title 24px on phone and 28px wider, no sideways scroll, every input labeled, every button and link at least 48px tall |
| Keyboard only | ✓ 13 of 13: Tab reaches everything with a visible ring, More menu opens and closes, the "are you sure" sheet starts on Cancel and Escape cancels, arrow keys switch tabs, Save shows the green message |
| 200% zoom (checked as a 640px-wide window) | ✓ no sideways scroll |
| Logged out | ✓ `/design-preview` sends you to the login page |

Screenshots: `docs/migration-reports/screens/design-preview-*.png`.

Not checked: color contrast was chosen to meet WCAG AA from the numbers, not measured with a tool on the page. A real phone was not used; the phone check is a 375px browser window.

### Proposals awaiting approval (nothing here is built)
Name changes, listed on the Words tab of the preview:
1. Complaints → Problems
2. Subcontractor → Sub
3. Submit → Send / Save
4. Account Updates → Notes
5. Account Health → How accounts are doing

Until you say yes, every screen keeps today's names.

### Decisions made without you
1. No new font. The audit suggested Quicksand and Karla; the kit uses the device's own rounded font, so no font files are added and nothing loads slower. Easy to change later in one line.
2. Colors come from the "Softer Edges" audit, with the amber and red made a little darker so the words pass contrast on their soft backgrounds.
3. The kit's built-in words (Back, Search, Saving…, Saved, Try again, Cancel, Step 2 of 4, status words) have their own English / Spanish / Portuguese list in `app/ui/words.ts`. Crew and sub screens keep using their existing translated strings for everything else.
4. To look at the preview on this computer, a local-only login secret was added to `.env.development.local` (git-ignored). It is not the production secret and does not work anywhere else.

### Protected files edited
None.

### Click-through test on your phone
A Vercel preview of the `migration/postgres` branch is needed for this (see the warning about the preview database in the Checkpoint 0 report first).
1. Log in, then open `/design-preview`. You should see "Design preview" with three tabs: Parts, A list, Words.
2. Tap the blue **Save** at the bottom. You should see "Saving…" then a green "Saved" message for 3 seconds.
3. Tap **Save that fails**. You should see a red box that says what went wrong and a **Try again** button.
4. Tap **More** (top right) → **Remove (asks first)**. A sheet slides up that says what will be removed. Tap **Cancel**.
5. Tap **Español**. Back, Saving…, Saved and the status words change to Spanish.
6. Tap the **A list** tab. Type "sun" in the search box. Only Sunrise Daycare stays. Clear it, tap **Empty**: you should see a friendly message with an "Add account" button.

### How to undo
`git revert` the Part B commit. It only adds files and appends a block to `app/globals.css`; no existing screen depends on it.
