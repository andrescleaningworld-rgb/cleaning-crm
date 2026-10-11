-- photos: the app takes over photo uploads from Apps Script
-- (DATA_SOURCE_PHOTOS=postgres). New photos are stored in Blob storage, and
-- the old ones (in Google Drive) are copied there too; blob_url is where the
-- copy is. The Drive file and drive_url are kept as they are.
ALTER TABLE photos ADD COLUMN IF NOT EXISTS blob_url TEXT NOT NULL DEFAULT '';
