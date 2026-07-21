// Server-side Google Geocoding API client. GOOGLE_GEOCODING_API_KEY is
// deliberately separate from NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — that key is
// HTTP-referrer-restricted for browser use, and the Geocoding API rejects
// referrer-restricted keys for server-side calls (see scripts/backfill-city-zip.js).

const GEOCODING_TIMEOUT_MS = 10_000;

export type GeocodeSuccess = {
  ok: true;
  latitude: number;
  longitude: number;
};

export type GeocodeFailure = {
  ok: false;
  // "no_results": the API call itself succeeded but found nothing for this
  // address — never worth caching or retrying with the same input.
  // "api_error": the call itself failed (bad key, wrong project, quota,
  // network, timeout) — worth surfacing distinctly since it usually needs a
  // config fix rather than a different address.
  kind: "no_results" | "api_error";
  reason: string;
};

export type GeocodeOutcome = GeocodeSuccess | GeocodeFailure;

type GoogleGeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    geometry?: { location?: { lat: number; lng: number } };
  }>;
};

export async function geocodeAddress(address: string): Promise<GeocodeOutcome> {
  const apiKey = process.env.GOOGLE_GEOCODING_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      kind: "api_error",
      reason: "Missing GOOGLE_GEOCODING_API_KEY in environment.",
    };
  }

  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}` +
    `&key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), GEOCODING_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    return {
      ok: false,
      kind: "api_error",
      reason: timedOut
        ? `Geocoding API request timed out after ${GEOCODING_TIMEOUT_MS}ms`
        : `Geocoding API request failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    return {
      ok: false,
      kind: "api_error",
      reason: `Geocoding API returned HTTP ${response.status}`,
    };
  }

  let data: GoogleGeocodeResponse;
  try {
    data = await response.json();
  } catch {
    return {
      ok: false,
      kind: "api_error",
      reason: "Geocoding API returned an invalid JSON response.",
    };
  }

  if (data.status === "ZERO_RESULTS") {
    return { ok: false, kind: "no_results", reason: "No results found for this address." };
  }

  if (data.status !== "OK") {
    // REQUEST_DENIED (bad key / wrong project / API not enabled),
    // OVER_QUERY_LIMIT (quota), INVALID_REQUEST, UNKNOWN_ERROR, etc. — all
    // indicate the call itself failed, not just "no match for this address".
    return {
      ok: false,
      kind: "api_error",
      reason: `Geocoding API call failed (status: ${data.status}${data.error_message ? ` — ${data.error_message}` : ""})`,
    };
  }

  const results = data.results ?? [];
  if (results.length === 0) {
    return { ok: false, kind: "no_results", reason: "No results found for this address." };
  }

  const location = results[0].geometry?.location;
  if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
    return { ok: false, kind: "no_results", reason: "Geocoding result did not include coordinates." };
  }

  return { ok: true, latitude: location.lat, longitude: location.lng };
}
