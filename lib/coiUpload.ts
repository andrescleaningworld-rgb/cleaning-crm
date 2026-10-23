// Saves one COI file (a PDF or a photo) to Vercel Blob, for the office upload
// (app/api/sub-insurance) and the sub portal upload
// (app/api/subcontractor-portal/insurance). Server only. Same storage as
// Documents: a random file name nobody can guess.

import { put } from "@vercel/blob";
import { looseDate } from "@/lib/subInsurance";

/** Vercel takes up to 4.5 MB in one request; photos are made smaller on the phone first. */
export const COI_MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

export type SavedCoiFile = { fileUrl: string; fileName: string; contentType: string; expiresOn: string };

/** Reads file + expiresOn from the form, checks them, stores the file. Throws a plain sentence when something is wrong. */
export async function saveCoiFromForm(form: FormData): Promise<SavedCoiFile> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("File storage is not set up here.");
  const file = form.get("file");
  const expiresOn = looseDate(form.get("expiresOn"));
  if (!(file instanceof File) || file.size === 0) throw new Error("Pick a PDF or take a photo first.");
  if (!expiresOn) throw new Error("Enter the expiration date.");
  const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "");
  if (!ALLOWED.test(type)) throw new Error("Use a PDF or a photo.");
  if (file.size > COI_MAX_BYTES) throw new Error("That file is too big. Use a PDF under 4 MB, or take a photo.");
  const extension = type === "application/pdf" ? ".pdf" : type === "image/png" ? ".png" : type === "image/webp" ? ".webp" : ".jpg";
  const blob = await put(`coi/${crypto.randomUUID()}${extension}`, file, { access: "public", contentType: type, addRandomSuffix: false });
  return { fileUrl: blob.url, fileName: (file.name || `insurance${extension}`).slice(0, 200), contentType: type, expiresOn };
}
