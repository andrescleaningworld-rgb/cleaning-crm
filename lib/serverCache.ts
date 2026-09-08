// Shared cache for server-side data fetched from slow/rate-limited upstreams
// (the shared Apps Script backend behind GOOGLE_SCRIPT_URL). Mirrors the
// TTL-cache pattern already used in lib/googleSheets.ts for direct Sheets
// API reads, but also de-dupes concurrent cache misses *within one
// serverless instance* into a single in-flight request.
//
// Backed by Vercel's Runtime Cache (per-region, shared across concurrent
// function instances) rather than a plain in-memory Map — the prior Map-based
// version was never actually shared between instances, which is exactly what
// let a burst of simultaneous callers landing on different cold instances
// each trigger their own upstream Apps Script call (see the diagnostic
// logging below, which caught this happening in production). Runtime Cache
// values are still scoped to the deployment's region(s); if this project
// ever runs across multiple regions, each region gets its own copy.

import { getCache } from "@vercel/functions";

const DEFAULT_TTL_MS = 60_000;

// Runtime Cache items are capped at 2MB. Rather than assume every cached
// payload stays under that as the accounts/subcontractors lists grow, skip
// the write (and log it) instead of letting an oversized cache.set fail —
// the caller still gets its data this request, it just isn't cached.
const MAX_CACHE_ITEM_BYTES = 1_900_000;

const cache = getCache({ namespace: "server-cache" });

// Local-only: collapses concurrent callers *on the same instance* into one
// upstream call while a fetch is in flight. Runtime Cache removes the need
// for this across instances, but a single instance can still receive several
// concurrent requests for the same key before the first write lands.
const inFlight = new Map<string, Promise<unknown>>();

// TEMPORARY diagnostic instrumentation for the Apps Script timeout incident —
// kept (not removed) per instruction, pending explicit confirmation once the
// Runtime Cache fix is verified working in production. INSTANCE_ID is
// generated once per cold start; previously, log lines for the same key
// showing different INSTANCE_IDs within the same ~60s window was direct
// evidence multiple serverless instances were each holding their own
// (never-shared) cache. Now that the cache itself is shared, a HIT should
// show up across different INSTANCE_IDs — that's the signal the fix worked.
const INSTANCE_ID = Math.random().toString(36).slice(2, 8);

function byteSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

async function setCached<T>(key: string, value: T, ttlMs: number): Promise<void> {
  const size = byteSize(value);
  if (size > MAX_CACHE_ITEM_BYTES) {
    console.warn(
      `[serverCache SKIP-CACHE] instance=${INSTANCE_ID} key=${key} sizeBytes=${size} exceeds ${MAX_CACHE_ITEM_BYTES} — serving uncached`
    );
    return;
  }

  await cache.set(key, value, { ttl: Math.ceil(ttlMs / 1000) });
}

export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL_MS
): Promise<T> {
  const cached = (await cache.get(key)) as T | undefined;
  if (cached !== undefined) {
    console.log(`[serverCache HIT] instance=${INSTANCE_ID} key=${key}`);
    return cached;
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
      await setCached(key, value, ttlMs);
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

// Like getOrFetch, but never serves a cached value — always performs (or
// joins) a live fetch. Still shares inFlight de-dupe with getOrFetch, so a
// burst of concurrent callers for the same key collapses into one upstream
// call, and still writes the fresh result into the same shared cache
// afterward so later getOrFetch() reads benefit from the freshness this call
// paid for.
//
// Use only where staleness would cause an actual correctness bug (e.g.
// merging a partial-field update onto a stale base record) — not as a
// general substitute for getOrFetch, since it bypasses the cache on every
// call, not just on a cold-cache miss.
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

  console.log(`[serverCache FRESH-MISS] instance=${INSTANCE_ID} key=${key} — bypassing cache, calling upstream`);
  const startedAt = Date.now();

  const promise = (async () => {
    try {
      const value = await fetcher();
      console.log(`[serverCache FRESH-DONE] instance=${INSTANCE_ID} key=${key} durationMs=${Date.now() - startedAt}`);
      await setCached(key, value, ttlMs);
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

export async function invalidateCached(key: string): Promise<void> {
  inFlight.delete(key);
  await cache.delete(key);
}
