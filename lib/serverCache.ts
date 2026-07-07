// Generic in-memory cache for server-side data fetched from slow/rate-limited
// upstreams (the shared Apps Script backend behind GOOGLE_SCRIPT_URL). Mirrors
// the TTL-cache pattern already used in lib/googleSheets.ts for direct Sheets
// API reads, but also de-dupes concurrent cache misses into a single in-flight
// request — a burst of simultaneous callers hitting a cold cache should not
// each trigger their own upstream call.

const DEFAULT_TTL_MS = 60_000;

type Entry<T> = { value: T; expiresAt: number };

const cache = new Map<string, Entry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() <= cached.expiresAt) return cached.value as T;

  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async () => {
    try {
      const value = await fetcher();
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

export function invalidateCached(key: string): void {
  cache.delete(key);
  inFlight.delete(key);
}
