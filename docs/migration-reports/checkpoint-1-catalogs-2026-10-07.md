## Checkpoint Area 1 (Catalogs & logs) – 2026-10-07

Time: 0.5 h actual vs 12 h estimate. Total so far: 1.2 h vs 32 h estimated (areas 0, B, 1). Remaining on the original estimate: about 298 h. Projected finish: not given yet. These three parts were small (19 rows of data, two short screens) and are not a fair measure of the big areas; the pace gets recalculated after Area 2 and again after Area 3. Deadline: not set.

### What changed (plain words)
- Five small lists now also live in the practice database: the "What's new" log, the address-lookup cache, extra services, company documents, and the log of documents sent to subs.
- The app can read and save these from either place. A switch, `DATA_SOURCE_CATALOGS`, picks which. It is **not set**, so the live app still uses Google Sheets exactly as before.
- Two screens have the new look: **Documents** and **Settings → Extra / Specialty Services**.

### Data check
| Table | Sheets | Postgres | |
|---|---|---|---|
| changelog_entries (ChangeLog) | 3 | 3 | ✓ |
| geocode_cache (GeocodeCache) | 0 | 0 | ✓ (the tab is empty) |
| extra_services (ExtraServices) | 4 | 4 | ✓ |
| documents (Documents) | 5 | 5 | ✓ |
| document_sends (DocumentSends) | 7 | 7 | ✓ |

Every row was compared field by field: 0 missing, 0 extra, 0 different. Parity: 11 reads, 11 identical, 0 explained. The same 6 web addresses returned byte-identical answers on Sheets and on Postgres.

Saves tested on Postgres with practice mode on: add / change / hide / show a service, send a document (the email was logged as `[dry-run]`, not sent; the send was written to the log), add and delete a document at the function level, address cache write. Google Sheets row counts were the same before and after.

Not tested here: uploading a real file (this computer has no Vercel Blob token), deleting a real document through the screen (it would delete a real file), and the address-lookup web addresses (they need the real Google Maps key).

### Questions for you (data)
None. The import raised 0 issues.

Things noticed, no action needed:
- GeocodeCache has never stored an address. The map looks up addresses every time. Not changed.
- `UploadedBy` is empty for all 5 documents.
- Document sends store the sub as a row number (`SUB-ROW-12`). That gets a permanent id in Area 3.

### Feature checklist: Documents
| Before | Now |
|---|---|
| "Upload Document" form at the top (Name, Category, File, 10 MB limit) | Blue **Add document** button at the bottom → sheet with the same three fields and the same limit |
| "Total Documents" box | In the line under the title: "5 documents" |
| Category buttons: All, Contract, Handbook, Policy, Other | Tabs with the same five |
| (none) | **New:** a search box (name or file name) |
| Table: Name + file name, Category, Size, Uploaded | Cards on a phone; the same columns in a table on a wide screen. Date reads "Tue, Aug 18" |
| View | **Open** |
| Send to Sub (pick a sub, your name, note; subs with no email marked) | **Send to sub** → sheet with the same fields; pick from a searchable list; "no email on file" still shown |
| "Document sent." box with a Close button | Green "Document sent" message, sheet closes |
| History | **More → Send history** |
| Delete, with a browser pop-up "This cannot be undone." | **More → Delete**, with a sheet that says the file is deleted for everyone, cannot be brought back, and the sent list stays |
| "Loading documents..." text | Gray placeholder cards |
| Red text on errors | Red box that says what happened, with **Try again** |
| "No documents yet — upload one above." | Friendly empty box with an **Add document** button |

### Feature checklist: Extra / Specialty Services
| Before | Now |
|---|---|
| "← Back to Settings" link | Back arrow in the header (goes to Settings) |
| "Active Services" box | In the line under the title: "4 active" |
| "Add New Service" form at the top (Name, Sort Order, Description, Image) | Blue **Add service** button at the bottom → sheet with the same four fields |
| Image uploads as soon as it is picked; "Remove image"; JPEG/PNG/WebP/GIF, 5 MB | Same behavior and limits; buttons read **Add picture / Change picture / Remove picture** |
| Table: Image, Name + description, Sort Order, Status (Active / Hidden) | Cards on a phone; same columns in a table on a wide screen. Status has a color, a word and an icon |
| Edit (form opens inside the table row) | **Change** → the same form in a sheet |
| Hide / Unhide (no confirmation) | **Hide / Show again** (still no confirmation: nothing is deleted) |
| Red text on errors | Red box with **Try again** |

Both screens were clicked through in a headless browser at 375px and 1280px (28 checks, all pass): 18px text, every button at least 48px, no sideways scroll. Screenshots: `docs/migration-reports/screens/documents-*.png`, `services-*.png`.

### Proposals awaiting approval
1. Button wording changed on these two screens (Upload → Add document, View → Open, Edit → Change, Unhide → Show again, Image → Picture). No feature or page was renamed. Say so if you want any of the old words back.
2. From Checkpoint B, still waiting: Complaints → Problems, Subcontractor → Sub, Account Updates → Notes, Account Health → How accounts are doing.

### Decisions made without you
1. Dates are stored twice: the exact text from Sheets and a real date. Screens get the Sheets text, so nothing reads differently.
2. Hiding a service still has no "are you sure". Deleting a document does.
3. Added a search box to Documents (rule 6: one search box per list).
4. The address cache keeps the first answer for an address if it is saved twice. Sheets kept both rows and used the first, so the result is the same.

### Protected files edited
None.

### Readers still on Sheets / Apps Script
For these five tabs: none in the code. All 8 web addresses that touch them go through the switch. In production the switch is off, so they still read Sheets.

### Click-through test on your phone
Needs a Vercel preview of `migration/postgres` (read the preview-database warning in the Checkpoint 0 report first). With the switch off, saves go to the real Sheets, so use a test item.
1. Open **Documents**. You should see your 5 documents as cards, a search box, and a blue **Add document** button at the bottom.
2. Type "nda" in the search box. Only the NDA stays. Clear it.
3. Tap **Handbook**. You should see the 3 handbooks.
4. On any card tap **More → Send history**. You should see who got it and when. Tap **Close**.
5. Tap **More → Delete**. Read the warning, then tap **Cancel**. Nothing is deleted.
6. Open **Settings → Extra / Specialty Services**. You should see 4 services with pictures and a green "Active".
7. Tap **Change** on one. The form opens with its details. Tap **Cancel**.

### How to undo
Data: `DATA_SOURCE_CATALOGS=sheets` (or leave it unset) + redeploy. It is unset today.
Screens: `git revert 247a23d` (Documents) and the Extra Services commit that follows this report.
Everything in Area 1: revert the commits whose message starts with `migration(catalogs)`.
