// The photos a customer sends with a portal request: only the ones this
// customer uploaded (/api/portal/upload puts them under portal/<account>/),
// never a link typed in from somewhere else. Server only.

import { storedFileUrl, storedPathname } from "@/lib/files";

export function customerPhotoLinks(accountId: string, sent: unknown, max = 6): string[] {
  const folder = `/portal/${accountId.replace(/[^A-Za-z0-9_-]/g, "_")}/`;
  return (Array.isArray(sent) ? sent : [])
    .map((url) => {
      // A private upload comes back as its signed app address (lib/files.ts): kept without the signature.
      const pathname = storedPathname(String(url));
      if (pathname !== null) return pathname.startsWith(folder.slice(1)) ? storedFileUrl(pathname) : "";
      try {
        const parsed = new URL(String(url));
        return parsed.protocol === "https:" && parsed.hostname.endsWith(".public.blob.vercel-storage.com") && parsed.pathname.startsWith(folder) ? String(url) : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .slice(0, max);
}

/** Today in New York: { mdy: "11/9/2026", iso: "2026-11-09" } (the server runs on UTC). */
export function newYorkToday(now = new Date()): { mdy: string; iso: string } {
  const ny = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" })
      .formatToParts(now)
      .map((part) => [part.type, part.value])
  );
  return { mdy: `${ny.month}/${ny.day}/${ny.year}`, iso: `${ny.year}-${ny.month.padStart(2, "0")}-${ny.day.padStart(2, "0")}` };
}

/** "Nov 9, 2026, 3:05 PM" in New York time. */
export function newYorkStampText(now = new Date()): string {
  return now.toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
