## Checkpoint Area 5 (Equipment) – 2026-10-08

Time: about 0.7 h actual vs 20 h estimate. Total so far: about 4.8 h vs 141 h estimated (areas 0, B, 1, 2, 3, 4a, 4b, 5).

**New estimate.** 189 hours are still on the plan; at the measured pace that is about **7 to 20 hours of Claude Code work**. Deadline: not set.

### What changed (plain words)
- The five equipment tabs are now also in the practice database: 2 types, 1 piece of equipment, 1 check-out. Repairs and parts are empty in the sheet today.
- The app can read and save equipment from either place. The switch `DATA_SOURCE_EQUIPMENT` is **not set**, so the live app still uses Google Sheets.
- Vehicles, staff PINs and the tablet reports were already in the database (they were built there), so nothing moved for them.
- Screens: the Equipment screens were rebuilt two weeks ago (Sept 24) with big buttons and photo cards. I kept that look. What changed: every Equipment screen now sits in the same page frame as the rest of the redesigned app (same title, same back arrow), the two older pop-ups (**Check out / Return** and **Repair**) are now big sheets, and the small text in the tablet-report history is now full size.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| equipment_categories (EquipmentCategories) | 2 | 2 | ✓ |
| equipment (Equipment) | 1 | 1 | ✓ |
| equipment_checkouts (EquipmentCheckouts) | 1 | 1 | ✓ |
| equipment_repairs (EquipmentRepairs) | 0 | 0 | ✓ |
| equipment_parts (EquipmentParts) | 0 | 0 | ✓ |

Every row compared field by field: 0 missing, 0 extra, 0 different. Parity: 13 reads, 13 identical. Nine web addresses returned byte-identical answers on both sources.

Saves tested on Postgres: 40 function checks (types, equipment, check-out, return, overdue rule, repairs, parts and stock, wrong and missing IDs), plus adding a type through the web address. Test rows were removed; the practice database matches Sheets again.

Not tested:
- **Check-out, return, repair and photo upload through the screens.** The sheets open and stop you when something is missing; the saves were checked at function level only.
- **The tablet app** (`/equipment-check/…`, PIN login) and the **subcontractor portal equipment page**. Neither was changed, except that the portal page shows the same Check out / Return sheet. Both need a login I do not use in tests.
- With so little real data (1 item), the comparison proves the plumbing, not every odd case. The 40 function checks cover the cases the sheet does not have yet.

### Found while doing this (worth your attention)
1. **Returning equipment erases who signed it out.** On a return, the code writes "signed in by" into the "signed out by" columns. So the record keeps who took it back and loses who gave it out, and "signed in by" stays empty. Your one check-out row shows exactly this. The new version copies the same behavior for now. (Proposal 1.)
2. **Stock changes do not record why.** "Used / Restocked / Correction" is asked for and then thrown away. (Proposal 2.)
3. The equipment section is barely used yet: 1 item, 1 check-out, no repairs, no parts.

### Feature checklist: Equipment screens
| Before | Now |
|---|---|
| Equipment home: 5 big buttons, search, 5 status chips with counts, photo cards | Same, inside the shared page frame |
| "← Equipment" button with a word | Back arrow (same as every other screen) |
| Item page: photo, tag, status, where it is, one main action, Edit / Mark repair / Retire, history, tablet reports | Same |
| Tablet-report history in small gray text (12–14px) | Full-size text |
| Check out / Return: small pop-up, small buttons | Sheet with the same boxes (holder type, who, account, return date, work order; or condition, damaged + 3 repair boxes), same checks, same request |
| Repair: small pop-up | Sheet with the same 4 boxes |
| Add equipment, Parts & stock, Staff & PINs, Vehicles, vehicle page, Add vehicle | Same, inside the shared page frame |
| Tablet app | Not changed |

Measured in a headless browser at 375px and 1280px on every Equipment screen plus both sheets: no sideways scroll, every button and box at least 48px, no text under 16px. 50 checks, all passed (one first-run miss was a mistake in the test). Nothing was saved.

### Proposals awaiting approval (nothing here is built)
1. **Fix the return bug** so "signed out by" is kept and "signed in by" is filled. Two letters in the Sheets code, two column names in the new one.
2. Keep a small history of stock changes (who, when, why).
3. Rebuild the inside of the Equipment screens with the shared kit (plain icons instead of emoji, the shared card and button styles). Looks only; about half a day. Say if you want it, since you approved the current look two weeks ago.
4. Still waiting from earlier: see the 4a and 4b reports.

### Decisions made without you
1. The Equipment screens keep their Sept 24 look; only the frame, the two pop-ups and the small text changed.
2. The return bug is copied, not fixed.
3. Rows created in the new database get the next row number, because the app finds a check-out by its row number when equipment comes back.
4. Values saved in the new database stay exactly as typed; Sheets sometimes reformats dates and numbers it is given.
5. "Has this person ever signed equipment in or out?" (asked before deleting a staff member) now follows the Equipment switch.

### Protected files edited
None. (`app/api/subcontractor-portal/equipment/route.ts` got one import line; it is not on the protected list.)

### Readers still on Sheets / Apps Script
None for equipment. `DATA_SOURCE_EQUIPMENT` depends only on People (staff names) and Subs (who holds an item), both already moved.

### Click-through test on your phone
On a Vercel preview of this branch:
1. Open **Equipment**. Five big buttons, a search box, and your T500 card.
2. Tap the card. Photo, tag number, a colored status, and **Assign to someone**.
3. Tap **Assign to someone**. A sheet slides up with Staff / Subcontractor, a person picker and "Signed out by". Tap **Cancel**.
4. Tap **Mark repair**. A sheet with Description and three optional boxes. Tap **Cancel**.
5. Tap the back arrow, then **Vehicles**, **Parts & stock**, **Staff & PINs**: each opens with the same title bar and a back arrow.

### How to undo
Data: leave `DATA_SOURCE_EQUIPMENT` unset (it is). Screens: revert "migration(equipment): step 5 …". Everything: revert the commits whose message starts with `migration(equipment)`.
