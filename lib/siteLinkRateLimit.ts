// Basic fixed-window rate limiting for the public /api/site-link/[token]/*
// routes. Backed by Vercel's Runtime Cache — same shared, cross-instance
// store lib/serverCache.ts already uses (falls back to an in-memory store
// outside the Vercel runtime, e.g. local dev — see getCache's own
// behavior). Good enough to blunt a scripted flood against a single link;
// not a substitute for real abuse monitoring.
import { getCache } from "@vercel/functions";

const cache = getCache({ namespace: "site-link-rate-limit" });

const WINDOW_SECONDS = 60;
const MAX_REQUESTS_PER_WINDOW = 20;

// Returns true if the request is allowed, false if the caller should be
// rate-limited. `key` should combine the token with the action (e.g.
// "order:<token>") so ordering and issue-reporting on the same link have
// independent budgets.
// `windowSeconds`: how long one budget lasts (a minute unless given; the
// portal's "send me a link" uses an hour).
export async function checkRateLimit(key: string, max = MAX_REQUESTS_PER_WINDOW, windowSeconds = WINDOW_SECONDS): Promise<boolean> {
  const windowBucket = Math.floor(Date.now() / 1000 / windowSeconds);
  const cacheKey = `${key}:${windowSeconds}:${windowBucket}`;

  try {
    const current = ((await cache.get(cacheKey)) as number | null) ?? 0;
    if (current >= max) return false;

    await cache.set(cacheKey, current + 1, { ttl: windowSeconds + 5 });
    return true;
  } catch (error) {
    // Cache unavailable — fail open rather than blocking legitimate
    // submissions over an infra hiccup; this is a courtesy limiter, not a
    // security boundary (token validity is what actually gates access).
    console.error("[siteLinkRateLimit] check failed, allowing request:", error);
    return true;
  }
}
