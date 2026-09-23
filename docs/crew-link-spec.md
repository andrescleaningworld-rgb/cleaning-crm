# Crew Link — Spec

Source: build prompt of 2026-09-23, saved verbatim, plus the approved plan.
Follows the simplicity rules and SHARED TRANSLATION rule in
docs/team-hub-spec.md.

## Process

Read-only review first (checklist_templates, checklist_submissions,
lib/checklistDb.ts, lib/checklistTemplate.ts, app/porter/[code],
app/api/porter-checklist, the account page's checklist section /
ChecklistTemplateEditor, and the Team Hub supply order + problem report
code), plan in 10 lines max, wait for approval. Never commit or push.

## Goal

Turn the Porter Checklist into "Crew Link": the existing checklist plus
"Order supplies" and "Report a problem", keeping its current logic.
/porter is live and used daily: changes are additive only; existing
checklists, codes, links, and submissions must keep working exactly as
today.

## Requirements

1. RENAME (display only): the "Porter Checklist" pill and all labels
   become "Crew Link" (crew-facing screens EN/ES). Keep routes
   (/porter/...), API paths, table names, and existing codes unchanged
   so live links keep working.
2. ACCOUNT PAGE (same place as today's checklist checkbox): three
   checkboxes per account: "Checklist" (existing behavior: upload the
   checklist doc as today), "Supply orders", "Problem reports". The
   Crew Link shows only what's checked.
3. SHARE WITH TEAM: next to the Crew Link, one "Share" panel: large QR
   code (generated client-side), link with "Copy", "Copy message"
   (EN/ES text with the link), and navigator.share on phones/tablets.
   No sms: links (they don't work on Windows).
4. CREW LINK HOME: big buttons for the enabled modules only:
   Checklist / Order supplies / Report a problem. Same identity as
   today (porter types or picks their name, as the checklist already
   does). Follow the simplicity rules in docs/team-hub-spec.md.
5. ORDER SUPPLIES: reuse the Team Hub order UI and supply_items
   catalog: +/- per item, optional note, "Send order". Recent orders
   with plain status.
6. REPORT A PROBLEM: reuse the Team Hub problem UI: type buttons,
   optional note (translated via lib/translate.ts), up to 5 photos
   (lib/imageResize.ts, Blob).
7. DATA: propose in the plan whether to reuse supply_orders/hub_issues
   (e.g. nullable site/crew + a Crew Link account reference) or add
   small tables. Prefer ONE staff queue and ONE email path for both
   Team Hub and Crew Link. No Sheets writes; account data read only via
   the existing account lookup.
8. ADMIN: Crew Link orders/problems appear in the staff queue and on
   the account page, with one-tap status, photos, English-first notes,
   "Promote to complaint" (manual only), and the same new-order/problem
   emails. Account problem badges include Crew Link problems.
9. EQUIPMENT CHECK APP NAVIGATION (separate from Crew Link, same pass):
   - Every screen after the name grid gets a big "← Back" (previous
     step) and a "Home" button (cancels the report, signs out, returns
     to the name grid). Nothing is saved on Home.
   - If the app is opened by someone with an active admin session
     (manager), show a small "Exit to Equipment" button that goes to the
     admin Equipment page. Employees without an admin session never see
     it and still can't reach any CRM page.

## Done criteria

tsc, ESLint, build separately. Test end to end on the dev DB (including
an existing porter checklist link still submitting as before), delete
test rows and blobs. Report in 10 lines max. Never commit or push.

## Approved plan (2026-09-23)

1. Data — REUSE the Team Hub tables (approved): `supply_orders` and
   `hub_issues` get `crew_link_account_id TEXT` + `reporter_name TEXT`;
   `site_id`/`crew_id` become nullable with a CHECK that a row has a site
   or a Crew Link account. Photos stay in `hub_photos` (parent_type
   'issue'). Team Hub crew/site queries use inner joins, so Crew Link rows
   never show in Team Hub crew apps or per-site views.
2. Module toggles in Postgres: `checklist_templates.supply_orders_enabled`
   / `problem_reports_enabled` (default false). The link is live if the
   Sheets "Checklist Needed" flag OR either toggle is on. Checklist-only
   behavior is unchanged.
3. Rename display labels only.
4. Account edit page: "Checklist Needed?" becomes a "Checklist" checkbox
   (same Sheets save as today) + "Supply orders" + "Problem reports"
   (Postgres, via the admin checklist-templates route).
5. Share panel: shared QR/Copy component (from Equipment Check), plus
   "Copy message" (EN/ES) and navigator.share on touch devices.
6. Crew home at /porter/[code]; checklist-only goes straight to today's
   checklist. Name typed once and remembered on the device. Order /
   problem screens reuse Team Hub's views; public routes under
   /api/porter-checklist/[code]/, rate-limited. Catalog = all active
   supply_items.
7. One email path shared by Team Hub and Crew Link.
8. One staff queue + badges include Crew Link rows; account page shows
   Crew Link orders/problems with the Team Hub admin components.
9. Equipment Check Back/Home + admin-only "Exit to Equipment".
10. Crew Link has no PIN (same as today's porter link) — rate-limited.
