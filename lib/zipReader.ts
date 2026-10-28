// A small .zip reader for the browser (Photos -> Import photos), with no
// library: the zip's file list is read from its end, and each file is
// unpacked only when it is needed (the browser's own DecompressionStream),
// so a 1 GB Google Drive download is never held in memory at once.
// Handles the two ways zips store files: as-is (0) and deflate (8), which is
// what Google Drive, Windows and macOS make. Not handled: encrypted zips and
// zips over 4 GB (ZIP64); Google Drive splits big downloads into 2 GB zips.

export type ZipEntry = { name: string; size: number; /** The file's date in the zip (ms), null when it has none. */ modified: number | null; read: () => Promise<Blob> };

/** A zip's file date ("DOS" date and time, the clock of the computer that made the zip). */
function dosTime(date: number, time: number): number | null {
  const y = (date >> 9) + 1980;
  const mo = (date >> 5) & 15;
  const d = date & 31;
  if (!date || mo < 1 || mo > 12 || d < 1) return null;
  return new Date(y, mo - 1, d, time >> 11, (time >> 5) & 63, (time & 31) * 2).getTime();
}

const u16 = (view: DataView, at: number) => view.getUint16(at, true);
const u32 = (view: DataView, at: number) => view.getUint32(at, true);

async function bytes(file: Blob, start: number, end: number): Promise<DataView> {
  return new DataView(await file.slice(start, end).arrayBuffer());
}

/** Every file in the zip (folders left out), in the zip's order. Throws a plain-words error for a zip it cannot read. */
export async function readZip(file: Blob): Promise<ZipEntry[]> {
  // The "end of central directory" record is in the last 64 KB + 22 bytes.
  const tailStart = Math.max(0, file.size - 65_557);
  const tail = await bytes(file, tailStart, file.size);
  let end = -1;
  for (let i = tail.byteLength - 22; i >= 0; i--) {
    if (u32(tail, i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("This is not a zip file, or it is damaged.");
  const count = u16(tail, end + 10);
  const dirSize = u32(tail, end + 12);
  const dirOffset = u32(tail, end + 16);
  if (dirOffset === 0xffffffff || count === 0xffff) throw new Error("This zip is too big to open here (over 4 GB). Download the folder in smaller parts.");

  const dir = await bytes(file, dirOffset, dirOffset + dirSize);
  const entries: ZipEntry[] = [];
  const decoder = new TextDecoder();
  let at = 0;
  for (let n = 0; n < count && at + 46 <= dir.byteLength; n++) {
    if (u32(dir, at) !== 0x02014b50) break;
    const flags = u16(dir, at + 8);
    const method = u16(dir, at + 10);
    const modified = dosTime(u16(dir, at + 14), u16(dir, at + 12));
    const packed = u32(dir, at + 20);
    const size = u32(dir, at + 24);
    const nameLength = u16(dir, at + 28);
    const extraLength = u16(dir, at + 30);
    const commentLength = u16(dir, at + 32);
    const localOffset = u32(dir, at + 42);
    const name = decoder.decode(new Uint8Array(dir.buffer, dir.byteOffset + at + 46, nameLength));
    at += 46 + nameLength + extraLength + commentLength;
    // Folders, and the hidden files macOS adds.
    if (name.endsWith("/") || name.startsWith("__MACOSX/") || /(^|\/)\._/.test(name)) continue;
    const encrypted = (flags & 1) === 1;
    entries.push({
      name,
      size,
      modified,
      read: async () => {
        if (encrypted) throw new Error("This file in the zip has a password.");
        if (method !== 0 && method !== 8) throw new Error("This file in the zip is packed in a way this page cannot open.");
        // The local header repeats the name and has its own extra length: the data starts after it.
        const local = await bytes(file, localOffset, localOffset + 30);
        if (u32(local, 0) !== 0x04034b50) throw new Error("The zip is damaged.");
        const dataStart = localOffset + 30 + u16(local, 26) + u16(local, 28);
        const data = file.slice(dataStart, dataStart + packed);
        if (method === 0) return data;
        const stream = data.stream().pipeThrough(new DecompressionStream("deflate-raw"));
        return new Response(stream).blob();
      },
    });
  }
  return entries;
}
