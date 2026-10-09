# Morning report, October 9, 2026

Everything on last night's list was built on `redesign/simple`, checked, and
merged into `main`. Production is still on Google Sheets. No Production
setting was changed and no migration was run on the production database.

## What went live

- **The new look**: navy bar, green buttons, 18px text, light-green tiles,
  red only for problems.
- **Left sidebar** on wide screens (Daily, Work, Office, then Settings, Help,
  Logout), with "Icons only". On a phone, Menu slides it in.
- **Back arrow** on every page except the Dashboard.
- **Dashboard**: six big counts ("To-dos pending" with the red overdue line,
  "To-dos done" this week, Open complaints, Accounts need you, Visits this
  month, Active accounts), each opening its filtered list. To-dos list,
  tiles, the rest behind More.
- **Accounts Center and the account page**: counts, one search box, chips,
  simple cards, the Next cleaning card and six tiles.
- **To-Do, Complaints, Visits, Sub Center / Subcontractors, Supplies,
  Equipment, Settings, login**: same style, counts that filter, tips, Undo.
- **"If it's not in the app, it does not exist!"**: loading screen, staff
  login, a daily banner on the Dashboard, Supply Orders, the add update form,
  the last line of app emails to staff and subs, and "Logged ✓ — now it
  exists!" after saves. The Monday team card shows on Mondays.
- **Visits**: "Add visit" is at the top of the Visits page, and "Log visit"
  on an account opens the form with that account selected.

## What is waiting for the cutover

These need new database tables, so they are switched off on Production and
today's screens show instead. They are on in the preview, on the practice
database.

| Feature | Flag (off when unset) | Tables |
| --- | --- | --- |
| Handoffs: Add accepted estimate, the New accounts board, owners and due dates on the checklist, the office's To process list, the supply order steps, My work, Settings → Team, Help → How it works | `FEATURE_HANDOFFS` | `db/migrations/018_handoffs.sql` |
| Sub portal simple home: PIN login, today's sites, the four big buttons, My requests, site photos, EN / ES / PT | `FEATURE_SUB_HOME` | `db/migrations/019_sub_home.sql` |

To turn them on at the cutover: apply migrations 018 and 019 to the
production database, set both flags to `1` for Production, and (for the sub
home) have `DATA_SOURCE_SUB_PORTAL=postgres`. Settings → Team is empty, as
asked: pick the Office people there first.

Also waiting, as before: the email / password customer portal, and the
Missing emails list (they need the customer portal data in Postgres).

## Roll back

The last good production commit before this merge is **`be0eb64`**.
In Vercel → Deployments, find the deployment for `be0eb64`, open its menu and
choose "Promote to Production".

## 10-minute phone checklist

Live site: https://cleaning-crm-xi.vercel.app

1. Open the site. The loading screen is navy with the rule. Log in: "Who are
   you?" → Office staff → your name. (1 min)
2. Dashboard: six counts on top. Tap "To-dos pending": To-Do opens with the
   same number. Back arrow. Tap "Open complaints": same number. (1 min)
3. Tap Menu: the sidebar slides in. Tap Accounts center. (30 sec)
4. Accounts Center: tap Need you, then Active. Type in "Find an account".
   Tap ⋯ on a card, then close it. (1 min)
5. Open an account: Next cleaning card, six tiles. Tap More, then Change
   status → pick the same status it has, add a note, Save: "Logged ✓ — now it
   exists!". **This is a real save to Sheets; it is the most important check.**
   (2 min)
6. Tap "Log visit": the form opens with that account selected. Go back. (30 sec)
7. To-Do: tap "+ Add to-do", add one for yourself, save it, then mark it
   Done. (1 min 30 sec)
8. Complaints, Visits, Sub Center, Supplies: each opens with its counts and
   a list. (1 min)
9. Have one subcontractor open the sub portal with their email: it should
   look and work as it did (accounts, complaints, report issue, supply
   order, schedule). (1 min)
10. Customer portal: `/customer-portal/login` with a real customer phone
    still opens the account. (30 sec)

If anything in steps 5, 7, 9 or 10 fails, roll back to `be0eb64` and tell me
which step.

## To try the parts that are waiting (preview, practice data)

Preview: https://cleaning-crm-git-redes-714f81-andrescleaningworld-rgbs-projects.vercel.app

- Dashboard → My work. Accounts Center → New accounts. Account Updates → To
  process. Supply Orders → Orders in progress. Settings → Team. Help → How it
  works.
- Sub portal: as staff open Sub Center → "ZZ Test Sub" → "Text the PIN setup
  link". The link shows on screen. Open it on your phone, pick a PIN, and try
  Problem, Extra job and Supplies. Then look at My work and To process as
  staff.

## Things I decided without you

- **"To-dos done this week"** counts Done to-dos due this week (or, with no
  due date, created this week). A to-do does not record the day it was marked
  Done.
- **"Accounts need you"** on the Dashboard uses the same rule as Accounts
  Center (High Risk, or an open crew problem).
- **Who can press a step's button**: any staff member. My work only lists
  what is yours, but nobody is locked out of helping.
- **Default owners and due days** for a new account's seven sections are in
  Settings → Team and can be changed there.
- **Only updates saved from now on** go on the To process list. Old ones are
  left alone.
- **The rule is not added to emails that go to customers.**
- **The account update email** is sent by the Google Apps Script, which I do
  not edit, so its wording is unchanged. The new supply order email (when
  supplies run on Postgres) is the short "what is waiting + link" kind.
- **Estimates and sub photos** go to the same Blob storage as Documents
  (`estimates/`, `sub-photos/`). They are not listed on the Documents page.
- **Personal streak** is kept on each person's device.
- **Talk** (voice to text) shows only on phones whose browser supports it;
  there is always a small box to type instead.
- **The supply pictures** are simple icons by kind of item; the supply list
  has no photos.
- **Protected files edited**: `app/subcontractor-portal/page.tsx`,
  `app/visits/page.tsx`, `app/login/page.tsx` (layout, words and the new
  sub home; nothing was removed).

## Not checked

- No real save was made on the live site by me. Step 5 and 7 above do that.
- No photo was uploaded in my tests (estimate, sub photos), so the upload
  itself is untested end to end.
- Voice to text was not exercised (a test browser has no microphone).
- The customer portal was not opened while logged in.
- The red notification count in the sidebar was not seen (the practice data
  had no new notifications).
