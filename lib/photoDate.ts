// When a photo was taken, for Photos -> Import photos. Browser only (reads
// the file). In this order:
//   1. "photo"     the camera's own date inside the photo (EXIF DateTimeOriginal,
//                  JPEG only; WhatsApp often removes it)
//   2. "name"      the date in the file's name, as phones and WhatsApp name
//                  them: IMG-20261015-WA0012.jpg, IMG_20261015_211233.jpg,
//                  PXL_20261015_..., "WhatsApp Image 2026-10-15 at 9.12.33 PM.jpeg"
//   3. "file"      the file's last-modified date, unless it is today (that is the
//                  day it was downloaded, not taken)
//   4. none        the person picks one date for those photos
// Times are the office's (New York): a photo taken at 9 pm stays on its day.

export type PhotoDateSource = "photo" | "name" | "file" | "";
export type PhotoDate = { at: string; source: PhotoDateSource };

/** The moment of a New York wall-clock time, as an ISO string (summer and winter time handled). */
export function newYorkTime(y: number, mo: number, d: number, h = 12, mi = 0, s = 0): string {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  // How far New York is behind UTC at that moment.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, part.value])
  );
  const shown = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(guess + (guess - shown)).toISOString();
}

const sane = (y: number, mo: number, d: number) => y >= 2000 && y <= new Date().getFullYear() + 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;

/** "2026:10:15 21:12:33" (the EXIF way). */
function fromExifText(text: string): string | null {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  return sane(y, mo, d) ? newYorkTime(y, mo, d, h, mi, s) : null;
}

/** The camera's date in a JPEG: DateTimeOriginal, else DateTimeDigitized, else the picture's DateTime. */
export async function exifDate(file: Blob): Promise<string | null> {
  try {
    const view = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let at = 2;
    while (at + 4 <= view.byteLength) {
      if (view.getUint8(at) !== 0xff) return null;
      const marker = view.getUint8(at + 1);
      const length = view.getUint16(at + 2);
      if (marker === 0xda) return null; // the picture itself starts: no EXIF before it
      // APP1 with "Exif\0\0"
      if (marker === 0xe1 && view.getUint32(at + 4) === 0x45786966) return readTiff(view, at + 10);
      at += 2 + length;
    }
  } catch {
    // An odd file: no date from inside it.
  }
  return null;
}

function readTiff(view: DataView, tiff: number): string | null {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const text = (at: number, count: number) => {
    let out = "";
    for (let i = 0; i < count && at + i < view.byteLength; i++) {
      const c = view.getUint8(at + i);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out;
  };
  /** The tags of one directory: tag -> its text (dates) or number (pointers). */
  const ifd = (start: number): Map<number, { text: string; value: number }> => {
    const out = new Map<number, { text: string; value: number }>();
    if (start + 2 > view.byteLength) return out;
    const count = u16(start);
    for (let i = 0; i < count; i++) {
      const entry = start + 2 + i * 12;
      if (entry + 12 > view.byteLength) break;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      if (type === 2) out.set(tag, { text: text(n <= 4 ? entry + 8 : tiff + u32(entry + 8), n), value: 0 });
      else if (type === 4) out.set(tag, { text: "", value: u32(entry + 8) });
    }
    return out;
  };
  const first = ifd(tiff + u32(tiff + 4));
  const exifPointer = first.get(0x8769)?.value;
  const exif = exifPointer ? ifd(tiff + exifPointer) : new Map();
  for (const found of [exif.get(0x9003), exif.get(0x9004), first.get(0x0132)]) {
    const date = found?.text ? fromExifText(found.text) : null;
    if (date) return date;
  }
  return null;
}

/** The date (and time, when there) in the file's name. */
export function nameDate(name: string): string | null {
  const base = name.split("/").pop() ?? name;
  // WhatsApp Image 2026-10-15 at 9.12.33 PM
  const wa = /(\d{4})-(\d{2})-(\d{2}) at (\d{1,2})\.(\d{2})\.(\d{2})\s*(AM|PM)?/i.exec(base);
  if (wa) {
    const [y, mo, d, hRaw, mi, s] = wa.slice(1, 7).map(Number);
    const pm = (wa[7] ?? "").toUpperCase() === "PM";
    const am = (wa[7] ?? "").toUpperCase() === "AM";
    const h = pm && hRaw < 12 ? hRaw + 12 : am && hRaw === 12 ? 0 : hRaw;
    if (sane(y, mo, d)) return newYorkTime(y, mo, d, h, mi, s);
  }
  // IMG_20261015_211233, PXL_20261015_211233123, 20261015_211233
  const withTime = /(?:^|[^0-9])(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/.exec(base);
  if (withTime) {
    const [y, mo, d, h, mi, s] = withTime.slice(1, 7).map(Number);
    if (sane(y, mo, d) && h < 24 && mi < 60 && s < 60) return newYorkTime(y, mo, d, h, mi, s);
  }
  // IMG-20261015-WA0012, Screenshot_20261015, 2026-10-15
  const dayOnly = /(?:^|[^0-9])(20\d{2})-?(\d{2})-?(\d{2})(?:[^0-9]|$)/.exec(base);
  if (dayOnly) {
    const [y, mo, d] = dayOnly.slice(1, 4).map(Number);
    if (sane(y, mo, d)) return newYorkTime(y, mo, d);
  }
  return null;
}

const todayInNewYork = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());

/** The best date for one photo, and where it came from ("" = none: ask). */
export async function photoDate(file: Blob, name: string, lastModified: number | null): Promise<PhotoDate> {
  const inside = await exifDate(file);
  if (inside) return { at: inside, source: "photo" };
  const named = nameDate(name);
  if (named) return { at: named, source: "name" };
  if (lastModified && Number.isFinite(lastModified)) {
    const when = new Date(lastModified);
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(when);
    // Today = when it was downloaded; before 2000 = no real date.
    if (day !== todayInNewYork() && when.getFullYear() >= 2000 && when.getTime() <= Date.now()) return { at: when.toISOString(), source: "file" };
  }
  return { at: "", source: "" };
}
