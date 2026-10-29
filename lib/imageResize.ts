// Client-side image resize — only ever call this from a "use client"
// component (uses browser Canvas/createImageBitmap APIs, not available
// server-side). Resizes to a max dimension before upload so a full-size
// phone photo (often 3-4000px, several MB) doesn't get sent over a
// possibly-poor site wifi connection.
//
// HEIC note: createImageBitmap decodes HEIC on Safari/iOS (it uses the
// OS-level image decoder), which covers the common case of an iPhone
// camera photo — but Chrome/Firefox cannot decode HEIC client-side at all.
// When decoding fails here, the ORIGINAL file is returned unresized and
// the upload endpoint (app/api/site-link/[token]/issue/route.ts) attempts
// a server-side conversion via sharp as a fallback — if that also can't
// decode it, the user gets a clear "unsupported format" error rather than
// a silent failure either way.

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export type ResizedImage = {
  blob: Blob;
  wasResized: boolean;
};

export async function resizeImageForUpload(file: File): Promise<ResizedImage> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // Couldn't decode client-side (e.g. HEIC on a non-Safari browser) —
    // hand the original off to the server, which will try its own
    // conversion.
    return { blob: file, wasResized: false };
  }

  try {
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
    const targetWidth = Math.round(width * scale);
    const targetHeight = Math.round(height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { blob: file, wasResized: false };

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );

    if (!blob) return { blob: file, wasResized: false };
    return { blob, wasResized: true };
  } finally {
    bitmap.close();
  }
}

/**
 * A copy no bigger than `maxSide` on its long side, as JPEG at `quality`
 * (0-1). null when the browser cannot read the photo (HEIC outside Safari).
 * The setup wizard's site survey photos: 1600px for the photo, 400px for
 * its small copy.
 */
export async function shrinkImage(file: Blob, maxSide: number, quality: number): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  } finally {
    bitmap.close();
  }
}

/* ---------- photos from phones: made small before they are sent ---------- */

/**
 * Why a photo could not be made ready to send:
 *   heic        an iPhone HEIC photo this browser cannot open (Chrome, Android, Windows)
 *   unreadable  not a photo, or a damaged file
 *   memory      the browser ran out of memory making it small (big phone photos)
 *   tooBig      still too big to send after making it small
 */
export type PhotoProblem = "heic" | "unreadable" | "memory" | "tooBig";
export type PreparedPhoto = { ok: true; full: Blob; thumb: Blob | null } | { ok: false; problem: PhotoProblem };

/** The most one photo may be when sent: Vercel refuses any upload over 4.5 MB. */
export const MAX_SEND_BYTES = 4 * 1024 * 1024;

// One photo at a time: a full-size phone photo takes 50-200 MB of memory while
// it is open, and iPhones reload the page (or refuse) when several are open at once.
let line: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const next = line.then(work, work);
  line = next.catch(() => undefined);
  return next;
}

const looksHeic = (file: Blob, name: string) => /\.(heic|heif)$/i.test(name) || /image\/hei[cf]/i.test(file.type);

type Opened = { source: CanvasImageSource; width: number; height: number; close: () => void };

/** The photo opened once. createImageBitmap first; some browsers open with <img> what it refuses. */
async function open(file: Blob): Promise<Opened | null> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    // fall through to <img>
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => {
        img.src = "";
        URL.revokeObjectURL(url);
      },
    };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

/** A JPEG copy no bigger than maxSide. The drawing space is freed right after (iPhones keep it otherwise). */
async function copyOf(photo: Opened, maxSide: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxSide / Math.max(photo.width, photo.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(photo.width * scale));
  canvas.height = Math.max(1, Math.round(photo.height * scale));
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(photo.source, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/**
 * A phone photo made ready to send: a JPEG no bigger than `fullSide` (always
 * under MAX_SEND_BYTES) and, when `thumbSide` is given, a small copy for
 * screens. The photo is opened once and one photo is done at a time. The
 * full-size original is never sent: when it cannot be made small, the reason
 * comes back instead (words: photoProblemText).
 */
export function preparePhoto(file: Blob, name: string, sizes: { fullSide: number; thumbSide?: number; quality: number }): Promise<PreparedPhoto> {
  return oneAtATime(async (): Promise<PreparedPhoto> => {
    const photo = await open(file);
    if (!photo) return { ok: false, problem: looksHeic(file, name) ? "heic" : "unreadable" };
    try {
      if (!photo.width || !photo.height) return { ok: false, problem: "unreadable" };
      let full = await copyOf(photo, sizes.fullSide, sizes.quality);
      if (!full) return { ok: false, problem: "memory" };
      if (full.size > MAX_SEND_BYTES) full = await copyOf(photo, Math.round(sizes.fullSide * 0.7), 0.7);
      if (!full) return { ok: false, problem: "memory" };
      if (full.size > MAX_SEND_BYTES) return { ok: false, problem: "tooBig" };
      const thumb = sizes.thumbSide ? await copyOf(photo, sizes.thumbSide, sizes.quality) : null;
      return { ok: true, full, thumb };
    } catch {
      return { ok: false, problem: "memory" };
    } finally {
      photo.close();
    }
  });
}

/** Plain English for staff screens. (Crew Link has its own EN/ES/PT words.) */
export function photoProblemText(problem: PhotoProblem): string {
  switch (problem) {
    case "heic":
      return 'An iPhone photo (HEIC) this device cannot open. Add it from the iPhone itself, or on the iPhone set Settings → Camera → Formats → "Most Compatible".';
    case "unreadable":
      return "This file cannot be opened as a photo.";
    case "memory":
      return "The phone ran out of memory making it small. Try again with fewer photos at once.";
    case "tooBig":
      return "Still too big to send after making it small.";
  }
}

/**
 * The server's answer to an upload, in plain words. Vercel refuses uploads
 * over 4.5 MB with its own page (not our JSON), so that case is named here.
 */
export async function readUploadReply<T extends { success?: boolean; error?: string }>(response: Response): Promise<{ ok: boolean; data: T; error: string }> {
  const data = ((await response.json().catch(() => null)) ?? {}) as T;
  if (response.ok && data.success !== false) return { ok: true, data, error: "" };
  if (response.status === 413) return { ok: false, data, error: "Too big to send (over 4.5 MB)." };
  if (data.error) return { ok: false, data, error: data.error };
  if (response.status === 401) return { ok: false, data, error: "You are logged out. Log in again, then try again." };
  if (response.status >= 500) return { ok: false, data, error: `The server had a problem (error ${response.status}). Try again.` };
  return { ok: false, data, error: `It was refused (error ${response.status}).` };
}
