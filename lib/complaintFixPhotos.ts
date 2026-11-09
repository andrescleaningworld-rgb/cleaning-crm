// "After" photos: the proof a complaint was fixed (staff "Close complaint",
// the sub's "Mark Resolved by Sub"). Stored like the other photos (lib/files.ts:
// the private store when connected) under complaints/<complaint>/after-…, and
// listed on the complaint's "fixed" event (complaint_events). Server only.

import { fileStorageOn, put, storedFileUrl, storedPathname } from "@/lib/files";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^image\/(jpeg|png|webp|heic|heif)$/i;

const folderOf = (complaintKey: string) => `complaints/${complaintKey.replace(/[^A-Za-z0-9_-]/g, "_")}/`;

/** Saves one after photo for this complaint. Returns its address, or throws a message to show. */
export async function saveFixPhoto(complaintKey: string, file: unknown): Promise<string> {
  if (!(file instanceof File)) throw new Error("No photo was sent.");
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error("The photo must be 10MB or smaller.");
  const byName = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  if (!ALLOWED.test(file.type) && !byName) throw new Error("Use a photo (JPG or PNG).");
  if (!fileStorageOn()) throw new Error("File storage is not set up here.");
  const extension = byName ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
  const blob = await put(`${folderOf(complaintKey)}after-${crypto.randomUUID()}${extension}`, file, {
    access: "public",
    contentType: file.type || "application/octet-stream",
    addRandomSuffix: false,
  });
  return blob.url;
}

/** Only after photos saved for this complaint (never a link from somewhere else). At most 10. */
export function fixPhotoLinks(complaintKey: string, sent: unknown): string[] {
  const folder = folderOf(complaintKey);
  return (Array.isArray(sent) ? sent : [])
    .map((url) => {
      const pathname = storedPathname(String(url));
      if (pathname !== null) return pathname.startsWith(folder) ? storedFileUrl(pathname) : "";
      try {
        const parsed = new URL(String(url));
        return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com") && parsed.pathname.startsWith(`/${folder}`) ? String(url) : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .slice(0, 10);
}
