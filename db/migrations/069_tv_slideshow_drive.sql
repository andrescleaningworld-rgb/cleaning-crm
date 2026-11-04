-- 069: Office TV slideshow settings, and pictures copied from a Google Drive
-- folder (Settings -> Pin Board -> "TV slideshow").
--
-- tv_slideshow_settings  one row:
--   idle_minutes      how long the board sits with no remote press, click or
--                     touch before the slideshow starts (1-60, default 5).
--   drive_folder_id   the Drive folder the pictures come from.
--   drive_enabled     off: no Drive pictures on the TV and no copying.
--   last_synced_at / last_error / last_count   what the last copy did.
--   sync_started_at   a copy is running (so two never run at once); a stale
--                     one (over 10 minutes) is taken over.
--
-- tv_drive_slides  one row per Drive picture copied to Vercel Blob (resized,
--   max 1920px). Drive is only read, never changed. A picture removed from
--   the folder loses its row and its Blob copy at the next copy.
--
-- New tables only; nothing existing is changed. Running it again changes
-- nothing. Until this runs the TV uses 5 minutes and shows starred photos only.
CREATE TABLE IF NOT EXISTS tv_slideshow_settings (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  idle_minutes INTEGER NOT NULL DEFAULT 5 CHECK (idle_minutes BETWEEN 1 AND 60),
  drive_folder_id TEXT NOT NULL DEFAULT '1STnQFkkCZ1Bb79iVkDSlSPs5cF1N4oG3',
  drive_enabled BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT NOT NULL DEFAULT '',
  last_count INTEGER NOT NULL DEFAULT 0,
  sync_started_at TIMESTAMPTZ,
  updated_by TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO tv_slideshow_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS tv_drive_slides (
  file_id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  modified_time TEXT NOT NULL DEFAULT '',
  blob_url TEXT NOT NULL,
  copied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
