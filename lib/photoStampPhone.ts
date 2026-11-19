// Browser only: the Photo Checklist stamp, burned onto a crew photo on the
// phone (like the Timemark app): a dark bar at the bottom with the time and
// date, the place, and "Item · Name" (lib/photoChecklist.ts photoStampLines).
// Works with no signal. The photo is already made small (lib/imageResize.ts
// preparePhoto); the stamped JPEG and its small copy come back, or null when
// this phone cannot do it (the server stamps it instead, lib/photoStamp.tsx).

async function openImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void } | null> {
  try {
    const bitmap = await createImageBitmap(file);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    return null;
  }
}

const toJpeg = (canvas: HTMLCanvasElement, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));

/** Shortens a line with "…" until it fits the width. */
function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

export async function stampOnPhone(photo: Blob, lines: string[], thumbSide: number): Promise<{ full: Blob; thumb: Blob } | null> {
  const image = await openImage(photo);
  if (!image) return null;
  const canvas = document.createElement("canvas");
  try {
    const { width, height } = image;
    if (!width || !height) return null;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(image.source, 0, 0, width, height);

    const shown = lines.filter(Boolean).slice(0, 3);
    const unit = Math.max(14, Math.round(Math.min(width, height) * 0.032));
    const pad = Math.round(unit * 0.8);
    const lineGap = Math.round(unit * 1.3);
    const barHeight = pad * 2 + lineGap * shown.length;
    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(0, height - barHeight, width, barHeight);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "top";
    shown.forEach((line, index) => {
      // The time line bigger and bold, like the server's stamp.
      ctx.font = index === 0 ? `bold ${Math.round(unit * 1.1)}px sans-serif` : `${unit}px sans-serif`;
      ctx.fillText(fitText(ctx, line, width - pad * 2), pad, height - barHeight + pad + index * lineGap);
    });

    const full = await toJpeg(canvas, 0.85);
    if (!full) return null;
    const scale = Math.min(1, thumbSide / Math.max(width, height));
    const small = document.createElement("canvas");
    small.width = Math.max(1, Math.round(width * scale));
    small.height = Math.max(1, Math.round(height * scale));
    small.getContext("2d")?.drawImage(canvas, 0, 0, small.width, small.height);
    const thumb = await toJpeg(small, 0.78);
    small.width = 0;
    small.height = 0;
    return thumb ? { full, thumb } : null;
  } catch {
    return null;
  } finally {
    image.close();
    canvas.width = 0;
    canvas.height = 0;
  }
}
