# Supplies report, October 11, 2026

Supply control is built, tested here, merged, and **off in production**. Nothing changes for anyone until you turn it on.

- **Preview (practice data, no real emails or texts):** https://cleaning-crm-git-featu-39597f-andrescleaningworld-rgbs-projects.vercel.app
- **Switch:** `FEATURE_SUPPLY_CONTROL`. Off in Production, on in the preview.
- **Tested:** 47 of 47 steps on the practice database, plus a run with the switch off to confirm the new parts hide and the existing Supplies and Supply Orders screens still load. Type check, lint (the usual 16) and build passed.
- **Production database:** not touched. It needs migration 027, and I could not take the backup branch `pre-supplies-2026-10-11` from this computer (same reason as the finish report). The tables wait until you turn it on.

It reuses what was there: the same supply list, the same Supply Orders page and PO PDF, the same Equipment Check tablet link and staff PINs, and the Board's Supplies box.

---

## What you get

| # | You asked for | What it does |
| --- | --- | --- |
| 1 | Supply list with photo, unit, cost, vendor, shelf location, minimum, shelf count | On the Supplies page, **Shelf** tab. Tap an item to edit all of them and take its photo |
| 2 | Supply Check tablet | Same tablet and PINs as Equipment Check. Name, PIN, where it is going (a site or **Office use**), picture grid with big − and +, **Done**. Stock drops, the cost goes to that site or the Office, logged with who and when. **Returned** puts items back |
| 3 | Order for a site in 3 taps | **Order for a site** on the Supplies page (site, +, Order), or **Order supplies** on an account's page (+, Order) |
| 4 | From shelf or Buy / ship direct, with steps | Each line is one or the other. Ordered → Approved → Picked or Bought → Delivered. Picking drops the stock. Small orders approve themselves. Orders show on Supply Orders and in the Board's Supplies box |
| 5 | Red Reorder list | **Reorder** tab: items at or below their minimum, each with **Make purchase order** (one tap, up to twice the minimum). When it is delivered the shelf goes up |
| 6 | Weekly count | After the PIN the tablet asks to count 5 items, starting Monday, until it is done that week. Differences are logged and the shelf count is corrected |
| 7 | Included or billed, spend, Mark invoiced | On each account: **Supplies included** or **Supplies billed to customer**. **Spend** tab: this month per site and Office use, with **Mark invoiced** on billed accounts |

The tablet is in English and Spanish, has the motto at the bottom, and never shows money.

---

## What is different from what you asked, or not done

- **The sub side was not changed.** Subs still order from the sub portal and Crew Link exactly as before, and those orders still arrive on Supply Orders and the Board. They do not yet get the "From shelf / Buy" choice or the new steps; only orders made with **Order for a site** do. I left this alone so nothing subs use could break while the switch is off.
- **Portuguese** on the tablet shows the Spanish words for now.
- **Approving** an order is owner only. Picked, Bought and Delivered can be tapped by any staff member.
- **The weekly count** can be put off with **Later**, so it never blocks someone who needs supplies. It keeps asking until someone does it.
- **Cost of a "Buy" line** is the item's cost on the list times the quantity, not the vendor's real invoice.
- **Not tested:** uploading an item's photo, and the **PO PDF** button on a bought line. Both use parts of the app that already work elsewhere, but I did not run them.
- **Tablet sign-in** needs a PIN that already exists. Someone new creates their PIN in Equipment Check first.

---

## To start

1. **Turn it on** (next section).
2. **Type the starting counts.** Supplies, **Shelf** tab. For each item: tap it, type **On the shelf now**, **Minimum**, **Cost of one**, vendor and shelf location, take a photo, Save. An item with no count shows "Not counted yet" and is never on the Reorder list.
3. **PINs.** Everyone who takes supplies needs an Equipment Check PIN. Give one in Equipment, Categories and Staff, the same way as today.
4. **Tablet.** Open Equipment Check on the shop tablet as today. A **Supplies** button appears at the top once the switch is on. Tap it; that is Supply Check.
5. **Small orders.** Supplies, **Spend** tab, "Small orders approve themselves". It starts at $50.
6. **Billed accounts.** On each account that pays for its supplies, open More and pick **Supplies billed to customer**.

---

## To turn it on in production

1. In Neon, make a backup branch of production named `pre-supplies-2026-10-11`.
2. Apply migration `027_supply_control.sql` to production. It only adds columns and new tables; it changes and removes nothing.
3. In Vercel, Production: add `FEATURE_SUPPLY_CONTROL=1`. Redeploy.
4. Open Supplies. The Shelf, Reorder, Orders and Spend tabs are at the top.

**To turn it off:** delete `FEATURE_SUPPLY_CONTROL` and redeploy. The new parts disappear and the Supplies page is as it is today. Counts and logs stay in the database for when you turn it back on.

---

## Test steps

Use the preview link. It runs on practice data.

**Phone**
1. Supplies. Tap an item on the **Shelf** tab. Set On the shelf now 20, Minimum 5, Cost 2.50. Save.
2. Tap **Order for a site**. Pick a site, tap + on that item, tap **Order**. It says it approved itself (under $50).
3. **Orders** tab: tap **Picked**. The shelf count for that item drops.
4. Tap **Delivered**. The line leaves the open list.
5. Board, Whole board: while the order was open it was a note in **Supply orders**.
6. Shelf: set that item's Minimum to 30. **Reorder** tab: it is there in red. Tap **Make purchase order**.
7. Open an account, More: tap **Order supplies** (the site is already picked). Then pick **Supplies billed to customer**.
8. Supplies, **Spend** tab: that account shows this month's amount with **Mark invoiced**.

**Tablet**
1. Open Equipment Check on the tablet. Tap **Supplies** at the top.
2. Tap your name, type your PIN.
3. If it asks for the weekly count, count the 5 items and tap **Save count** (or **Later**).
4. Tap a site, or **Office use**.
5. Tap + on two items. Tap **Done**. It says "Saved! Thank you".
6. On your phone, Supplies, Spend tab, "Who took what": your name, the items and the site are there, and the shelf counts dropped.
7. On the tablet, tap **Returned**, pick the same site, tap + on one item, **Done**. The count goes back up.
8. Tap **ES**. Everything is in Spanish.
