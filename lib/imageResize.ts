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
