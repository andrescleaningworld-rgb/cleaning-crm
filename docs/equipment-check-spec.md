# Equipment Check App — Spec

Source: Part 4 of the Team Hub build prompt (2026-09-22), saved verbatim
so it can't get lost again. Also follows the global rules in
docs/team-hub-spec.md (simplicity rules, shared translation).

## Process

First do a read-only review (app/equipment/* incl. its Staff tab, the
equipment functions in lib/googleSheets.ts, lib/email.ts) and report a
plan in 10 lines max, then STOP for approval before writing code.

## Goal

One tiny app on shared company tablets. Anyone who used a piece of
equipment reports how they left it. Nothing else. Usable with zero help.
Follow the spec's simplicity rules. This is an add-on: existing
Equipment pages, inventory, checkout/return, repairs, and parts stay
untouched and are only read, never changed.

## Requirements

1. EMPLOYEE PAGE: /equipment-check, its own home-screen app (manifest
   scoped to that path). No nav, no access to any other CRM page.
2. WHO (shared tablets, nobody stays logged in):
   - Every report starts with a name grid: active Staff who have a PIN
     or pending PIN setup. No new people table; PINs attach to existing
     Staff IDs, stored hashed in Postgres. Managers never see PINs.
   - Then a big 4-digit PIN keypad (reuse Team Hub's keypad and PIN
     hashing/lockout).
   - Auto sign-out after "Done!" and after 2 minutes of no taps.
3. PERSONAL PINs:
   - In Equipment's Staff list, a manager taps "Allow PIN setup"
     (valid 48 hours) and "Text invite", which opens Messages with,
     EN/ES: "Hi [name], here's the equipment app: [link]. The first
     time, tap your name and create your own 4-digit PIN."
   - On the tablet that person shows a "New" badge; tapping opens
     "Create your PIN" (enter twice), then continues to the report.
   - Forgot PIN: "Reset PIN" re-allows setup for 48 hours.
4. ONE FLOW:
   a. "What did you use?" — grid of equipment cards with photo (if any)
      and big tag number/name.
   b. "How did you leave it?" — Green "Good" / Yellow "Damaged or not
      working" / Red "Lost".
   c. Green submits immediately (no notes/Send screen) → "Done!".
   d. Yellow: big "TAKE PICTURE" (input accept="image/*"
      capture="environment"), required, max 3. Red: photo optional.
      Resize with lib/imageResize.ts, upload to Vercel Blob.
   e. Optional notes box "Notas / Comentarios" (keyboard mic for
      voice), through shared translation (lib/translate.ts from Part 1).
   f. Big "SEND" → "Done! Thank you" → sign out → name grid after 3
      seconds.
5. STORAGE: new Postgres table equipment_reports (id, staff_id,
   equipment_id, condition good/damaged/lost, notes_original,
   notes_english, notes_lang, photo_urls, created_at). No Sheets writes.
6. EMAIL on Yellow/Red via sendInternalNotification wrapped in
   waitUntil, matching existing email styling: equipment + tag, who,
   when, English notes on top, original below, photos inline, link to
   the equipment item.
7. MANAGER SIDE (inside the Equipment pill): on each item, "Last
   reported by" + condition and report history with photos; on each
   Staff member, their report history; "Open tablet app" button at the
   top of Equipment.
8. ADMIN CAUTION: wherever "Last reported by" or history appears, show:
   "Last report only — not proof of who caused it. Someone may have used
   it after without reporting. Check before acting." Never label anyone
   as responsible automatically.

Follow the Team Hub simplicity rules in docs/team-hub-spec.md (huge
buttons, icons + few words, no typing required, no hidden menus, EN/ES
by device language).

## Done criteria

After building: tsc, ESLint, build as three separate commands; test end
to end on the dev DB with throwaway rows, then delete them; report in 10
lines max. Do not commit.

## Implementation notes (2026-09-23, approved decisions)

- **Secret link** (approved over plain `/equipment-check`): the app lives at
  `/equipment-check/<key>`. One company-wide key in `equipment_check_link`,
  created on first use. "New link" next to "Open tablet app" replaces it: the
  old link stops working and every tablet session signs out (key_version).
- **Additions to existing Equipment files are OK** (approved): `app/equipment/page.tsx`
  ("Open tablet app"), `app/equipment/[id]/page.tsx` ("Tablet Reports" section),
  `app/settings/equipment-categories/page.tsx` (Staff list "Tablet PIN" column +
  per-person "Reports"). No existing behavior changed; UI lives in
  `app/equipment/EquipmentCheckAdmin.tsx`.
- **Tables** (`scripts/setup-equipment-check-db.js`, additive): `equipment_check_link`,
  `equipment_staff_pins` (keyed by Sheets Staff ID, hash only, no names),
  `equipment_reports` (spec §5 fields). No Sheets writes anywhere.
- **PINs**: `lib/pinAuth.ts` holds the shared bcrypt cost + lockout rule (5 wrong
  = 15 min), now also used by Team Hub. "Allow PIN setup" and "Reset PIN" are
  the same action (clear PIN + lock, open 48h window). Lockout emails the office
  once. Keypad is the shared `app/components/PinKeypad.tsx` (Team Hub uses it too).
- **Session**: own cookie `cw_equipment_check_session` (reuses
  `TEAM_HUB_SESSION_PASSWORD`), 15-min server backstop refreshed per request;
  the page signs out after "Done!" and after 2 min with no taps. Every request
  re-checks the key version and that the person is still Active in Staff.
- **No nav**: the layout draws a full-screen layer over the root layout's CRM
  header instead of changing the shared header.
- **Tablet setup** (2026-09-23 follow-up): "Open tablet app" became "Set up a
  tablet" — a panel with a QR code of the link (generated in the browser by the
  `qrcode` npm package, no external service), the link + Copy, "Email link"
  (mailto), EN/ES Add to Home Screen steps, and "Make a new link". The tablet
  shows a dismissible Add to Home Screen banner (that device's steps) until it
  runs from the Home Screen.
- **Invites**: shared tablets need no invite — "Allow PIN setup" is the main
  action, then the Staff row says "They can now tap their name on the tablet to
  create a PIN." "Copy invite (own phone)" is only for someone who wants the app
  on their own phone: copies the EN + ES message, or opens the share sheet on a
  phone/tablet. (`sms:` links were dropped — they do nothing on Windows.)
- **Email** (Yellow/Red only): plain-text like the other internal emails, photos
  as attachments (new optional `attachments` param on `sendInternalNotification`)
  plus their links, English notes then original, link to `/equipment/<id>`,
  and the §8 caution line.
- **Tag number** = the item's Serial Number when set; Retired items are hidden
  from the tablet.
