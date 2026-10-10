# Photos

One page (`/photos`, sidebar → Work → Photos) that shows every photo in the
app, by account, issue and date. Staff only. Behind `FEATURE_PHOTOS`: `1` on,
`0` off, unset = off on Production, on in local dev and on previews (the same
rule as the other feature flags).

## Where the app keeps photos today

| What | Saved from | The file is in | Listed in |
| --- | --- | --- | --- |
| Complaint photos | Complaints (staff) | Google Drive, put there by Apps Script | Sheets "Photos" tab (copy in Postgres `photos`) |
| Old sub portal issue photos | Sub portal → Report Issue | Google Drive, by Apps Script | Sheets "Photos" tab (copy in `photos`) |
| Customer portal complaint photos | Customer portal → Report a problem | Google Drive (the app uploads directly) | `portal_requests.photos` (links, comma separated) |
| Crew problem photos | Team Hub and Crew Link problem reports | Blob (`crew-link-issues/`, Team Hub folder) | `hub_photos` on a `hub_issues` row |
| Sub portal before / after | Sub portal → Photos button | Blob (`sub-photos/`) | `sub_site_photos` |
| Photo on a sub's problem or extra-job request | Sub portal → Problem / Extra job | Blob (`sub-photos/`) | `handoff_items.data.photoUrl` |
| Extra job photos | Extra Jobs → Done (after photo) | Blob (`extra-jobs/`) | `extra_job_photos` |
| Accepted estimates (photo or PDF) | Account → Add accepted estimate | Blob (`estimates/`) | `handoff_items.data.estimateUrl` |
| Equipment photo | Equipment item | Blob | `equipment.photo_url` |
| Equipment check report photos | Equipment Check tablet | Blob (`equipment-reports/`) | `equipment_reports.photo_urls` |
| Vehicle photo | Equipment → Vehicles | Blob | `vehicles.photo_url` |

Not photos of work, so not indexed: the pictures of extra services in
Settings (`extra_services.image_url`) and the files on the Documents page.

Places that have no photos today: **Visits** (a visit has no photo field) and
**Supply Orders**. "Visit" exists as a kind in the index for when visits get
photos.

## The index

`photo_index` (`db/migrations/024_photo_index.sql`): one row per photo with
the link to the file, where it is kept (Blob or Drive), the account, the
kind (Complaint, Crew problem, Sub photo, Extra job, Estimate, Equipment,
Visit), before / after, the linked item and where to open it, who took it,
and when.

It is an index only. No file is moved, changed or deleted, and the tables
that own the photos are not changed.

**How it is filled, and stays filled** (`lib/pg/photo-index.ts`): one
"copy in what is missing" step per source above. It runs every time the
Photos page asks for photos (at most once a minute; the Sheets Photos tab is
asked through Apps Script's read-only `getPhotos` at most every 5 minutes). So
a photo saved anywhere shows up on the page without each upload screen having
to know about the index, including photos Apps Script puts in Drive. The
same step can be run by hand: `npx tsx scripts/migrate/fill-photo-index.mts`
(practice database only).

## The page

- Three big counts: This week, Problems (complaints, crew problems and sub
  problem photos), Before / After. Tap one to filter.
- "Find an account", and three chips: Account, Issue, Date (Today, This week,
  This month, or pick dates; days are your own days, not the server's).
- Grouped by account, newest first, a grid under each. Every photo has a
  small label: the issue (or Before / After) and the date.
- Before / After photos of the same day sit side by side, Before on the left.
- Tap a photo: full screen, swipe left / right, the account, the issue, who
  and when, a button that opens the linked item, and "Original file".
- Small thumbnails (Next's image resizer for Blob files, Drive's own
  thumbnail for Drive files); 60 photos at a time, more as you scroll.
- Account page → More → Photos opens the page filtered to that account.
- Where the flag is off: no sidebar entry, no button on the account page, and
  the page says it is not turned on.

## Staff only

`/photos` and `/api/photo-index` are not on any public list in `proxy.ts`, so
a subcontractor, a customer or a logged-out visitor is sent to the login. The
API also checks the staff session itself.

## Add photos

The green "Add photos" button on the page puts photos you already have into the index.

- **From this device**: pick one or many (up to 20 at a time, 10MB each). They are stored in Blob storage under `photos/`.
- **From Google Drive**: paste a link to a photo, or to a folder of photos. The photos stay in Drive; they are listed, not copied or moved. Adding the same link twice adds nothing.

For both you pick the account (from the list), what the photos are of, Before / After / Neither, and the day they were taken.

**Drive needs one thing turned on.** The app looks in Drive as its own Google account (the service account), read-only. On 2026-10-09 Google answered "accessNotConfigured": the Google Drive API is not enabled in that account's Google Cloud project. Until it is enabled:

- a link to a single photo is still added, without the app being able to check it; its picture shows only if the file is set to "Anyone with the link";
- a folder link cannot be opened, and the form says so.

Once the Drive API is enabled, a folder (shared with the service account as Viewer, or set to "Anyone with the link") imports every picture directly inside it, up to 300 at a time, and pictures of files shared only with the app are shown through the app.
