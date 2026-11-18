// Server only: the stamp burned into the bottom of a crew photo — date and
// time (New York, the server's time), the account's name and address, on a
// semi-transparent bar. The original is kept unstamped (lib/pg/crew-photos.ts).
//
// The text is drawn by next/og (it brings its own font: a Vercel server has
// no fonts for sharp to draw text with), then laid on the photo with sharp.

import sharp from "sharp";
import { ImageResponse } from "next/og";

/** "Nov 17, 2026 · 7:42 PM" in New York. */
export function stampTime(at: Date): string {
  const day = at.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
  const time = at.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" });
  return `${day} · ${time}`;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * The stamped photo (JPEG) and its small copy (400px, stamped too, for the
 * customer portal's grid). null when the photo cannot be read: the caller
 * keeps the photo as it came.
 */
export async function stampPhoto(input: Buffer, stamp: { at: Date; accountName: string; address: string }, thumbSide = 400): Promise<{ full: Buffer; thumb: Buffer } | null> {
  try {
    // Turned upright first (the phone's EXIF turn), so the bar is at the real bottom.
    const upright = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
    const { width, height } = upright.info;
    if (!width || !height) return null;

    const barHeight = Math.max(44, Math.round(Math.min(width, height) * 0.085));
    const big = Math.max(14, Math.round(barHeight * 0.36));
    const small = Math.max(12, Math.round(barHeight * 0.28));
    const pad = Math.round(barHeight * 0.3);
    const second = [stamp.accountName.trim(), stamp.address.trim()].filter(Boolean).join(" · ");
    const chars = Math.max(20, Math.floor((width - pad * 2) / (small * 0.55)));

    const bar = new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: `0 ${pad}px`,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            color: "#ffffff",
          }}
        >
          <div style={{ fontSize: big, fontWeight: 700, lineHeight: 1.15 }}>{stampTime(stamp.at)}</div>
          {second ? <div style={{ fontSize: small, lineHeight: 1.2, opacity: 0.95 }}>{clip(second, chars)}</div> : null}
        </div>
      ),
      { width, height: barHeight }
    );
    const barPng = Buffer.from(await bar.arrayBuffer());

    const full = await sharp(upright.data)
      .composite([{ input: barPng, top: height - barHeight, left: 0 }])
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
    const thumb = await sharp(full).resize({ width: thumbSide, height: thumbSide, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
    return { full, thumb };
  } catch (error) {
    console.error("[photo stamp]", error instanceof Error ? error.message : error);
    return null;
  }
}
