// Crew Link: the link's checklist, kept on the phone for no signal.
//
// Each good load is kept on the phone (localStorage), so the link still
// opens with no signal (inside the building). The page itself and its files
// come from the app's service worker (public/sw.js). A link the office
// turned off (a real answer from the server) is never replaced by the kept
// copy, and its copy is removed.

export const linkCacheKey = (code: string) => `crew-link-load:${code}`;
/** With a kept copy, a very weak signal waits at most this long before the copy is used. */
export const LOAD_WAIT_MS = 6000;

class LinkRefused extends Error {}

type Answer = { success?: boolean; error?: string };

function keptLink<T>(code: string): T | null {
  try {
    const raw = localStorage.getItem(linkCacheKey(code));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** The link's data: from the server when it answers in time, else the copy kept on this phone. `keep` = false never reads or writes the copy (admin preview). */
export async function loadLink<T extends Answer>(code: string, keep: boolean, waitMs = LOAD_WAIT_MS): Promise<T> {
  const kept = keep ? keptLink<T>(code) : null;
  const controller = new AbortController();
  const timer = kept ? setTimeout(() => controller.abort(), waitMs) : null;
  try {
    const response = await fetch(`/api/porter-checklist?code=${encodeURIComponent(code)}`, { cache: "no-store", signal: controller.signal });
    // A Wi-Fi sign-in page can answer with a web page: that is no answer.
    const data = (await response.json().catch(() => null)) as T | null;
    if (data && (!response.ok || data.success === false) && response.status < 500) throw new LinkRefused(data.error ?? "Could not load this link.");
    if (!data || !response.ok || data.success === false) throw new Error("Could not load this link.");
    if (keep) {
      try {
        localStorage.setItem(linkCacheKey(code), JSON.stringify(data));
      } catch {
        // best-effort: the link just won't open offline
      }
    }
    return data;
  } catch (error) {
    if (error instanceof LinkRefused) {
      if (keep) {
        try {
          localStorage.removeItem(linkCacheKey(code));
        } catch {
          // best-effort
        }
      }
      throw error;
    }
    // No signal, a very weak one, or a server hiccup: the copy kept on this phone.
    if (kept) return kept;
    throw error instanceof Error && error.name !== "AbortError" ? error : new Error("Could not load this link.");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
