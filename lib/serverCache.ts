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

// TEMPORARY diagnostic instrumentation for the Apps Script timeout incident —
// remove once we've confirmed whether repeat calls are actually being served
// from cache. INSTANCE_ID is generated once per cold start; if log lines for
// the same key show different INSTANCE_IDs across requests within the same
// ~60s window, that's direct evidence multiple serverless instances are each
// holding their own (never-shared) in-memory cache, which would explain why
// this caching reduced load without fully eliminating the timeouts.
const INSTANCE_ID = Math.random().toString(36).slice(2, 8);

export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cached = cache.get(key);
  if (cached && Date.now() <= cached.expiresAt) {
    console.log(`[serverCache HIT] instance=${INSTANCE_ID} key=${key} ageMs=${Date.now() - (cached.expiresAt - ttlMs)}`);
    return cached.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) {
    console.log(`[serverCache JOIN] instance=${INSTANCE_ID} key=${key} (awaiting in-flight fetch)`);
    return pending as Promise<T>;
  }

  console.log(`[serverCache MISS] instance=${INSTANCE_ID} key=${key} — calling upstream`);
  const startedAt = Date.now();

  const promise = (async () => {
    try {
      const value = await fetcher();
      console.log(`[serverCache MISS-DONE] instance=${INSTANCE_ID} key=${key} durationMs=${Date.now() - startedAt}`);
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (err) {
      console.log(
        `[serverCache MISS-ERROR] instance=${INSTANCE_ID} key=${key} durationMs=${Date.now() - startedAt} error=${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

// Like getOrFetch, but never serves a TTL-cached value — always performs (or
// joins) a live fetch. Still shares inFlight de-dupe with getOrFetch, so a
// burst of concurrent callers for the same key collapses into one upstream
// call, and still writes the fresh result into the same cache map afterward
// so later getOrFetch() reads benefit from the freshness this call paid for.
//
// Use only where staleness would cause an actual correctness bug (e.g.
// merging a partial-field update onto a stale base record) — not as a
// general substitute for getOrFetch, since it bypasses the TTL cache on
// every call, not just on a cold-cache miss.
export async function getFreshAndCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const pending = inFlight.get(key);
  if (pending) {
    console.log(`[serverCache FRESH-JOIN] instance=${INSTANCE_ID} key=${key} (awaiting in-flight fetch)`);
    return pending as Promise<T>;
  }

  console.log(`[serverCache FRESH-MISS] instance=${INSTANCE_ID} key=${key} — bypassing TTL cache, calling upstream`);
  const startedAt = Date.now();

  const promise = (async () => {
    try {
      const value = await fetcher();
      console.log(`[serverCache FRESH-DONE] instance=${INSTANCE_ID} key=${key} durationMs=${Date.now() - startedAt}`);
      cache.set(key, { value, expiresAt: Date.now() + ttlMs });
      return value;
    } catch (err) {
      console.log(
        `[serverCache FRESH-ERROR] instance=${INSTANCE_ID} key=${key} durationMs=${Date.now() - startedAt} error=${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
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
