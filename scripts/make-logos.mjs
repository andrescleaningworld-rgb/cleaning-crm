// Rebuilds every logo and icon file in /public from the one piece of artwork
// the project has: the Cleaning World emblem in public/logo-CW-single.png
// (138 x 90 pixels once its empty margin is cut off).
//
//   node scripts/make-logos.mjs
//
// Why: several files were the emblem at its tiny original size in the middle
// of a large empty square, so wherever they were shown the logo came out as
// a dot. Each file below has the emblem centered and filling its canvas.
//
// The emblem is only 138 pixels wide. It is sharp at the sizes the app shows
// it (up to about 90 pixels wide); the 512-pixel icons are that same artwork
// enlarged, so they are centered and not stretched, but soft. A larger
// original (ideally an SVG) would fix that: replace SOURCE and run again.
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const PUBLIC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const SOURCE = path.join(PUBLIC, "logo-CW-single.png");

const emblem = await sharp(SOURCE).trim({ threshold: 12 }).png().toBuffer();
const { width: w, height: h } = await sharp(emblem).metadata();

/** The emblem scaled to `emblemWidth`, centered on a square `size` canvas. Aspect ratio is never changed. */
async function square(file, size, emblemWidth, background) {
  const art = await sharp(emblem).resize({ width: emblemWidth, kernel: "lanczos3" }).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: art, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(PUBLIC, file));
  console.log(`${file}: ${size}x${size}, emblem ${emblemWidth}px wide (${Math.round((emblemWidth / size) * 100)}% of the width)`);
}

const CLEAR = { r: 0, g: 0, b: 0, alpha: 0 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

// The emblem alone, no margin, twice its original size: the header.
await sharp(emblem).resize({ width: w * 2, kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(path.join(PUBLIC, "cw-emblem.png"));
console.log(`cw-emblem.png: ${w * 2}x${h * 2}, no margin`);

// Square, see-through background: every place that shows the logo in a small square box.
await square("logo-CW-single-phone-optimized.png", 512, 472, CLEAR);

// Browser tab and phone home-screen icons: white background.
await square("icon-192.png", 192, 150, WHITE);
await square("icon-512.png", 512, 400, WHITE);
await square("apple-touch-icon.png", 180, 140, WHITE);
// "Maskable": phones may cut this one into a circle, so the emblem stays inside the middle 60%.
await square("maskable-icon-512.png", 512, 300, WHITE);
