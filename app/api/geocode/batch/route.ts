import { NextRequest, NextResponse } from "next/server";
import { getGeocodeCacheEntry, appendGeocodeCacheEntry } from "@/lib/googleSheets";
import { geocodeAddress, redactSensitiveText } from "@/lib/geocoding";

// Bulk geocoding (e.g. one-time backfill of Coverage towns) can process many
// uncached addresses serially with a throttling delay between live API calls —
// give it more room than the default function timeout.
export const maxDuration = 120;

const LIVE_CALL_DELAY_MS = 200; // throttle between live Geocoding API calls only

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type BatchGeocodeResult = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  cached: boolean;
  error?: string;
};

export async function POST(request: NextRequest) {
  let body: { addresses?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.addresses)) {
    return NextResponse.json({ error: "addresses must be an array of strings" }, { status: 400 });
  }

  const addresses = body.addresses
    .map((a) => (typeof a === "string" ? a.trim() : ""))
    .filter((a) => a.length > 0);

  if (addresses.length === 0) {
    return NextResponse.json({ results: [] });
  }

  try {
    // Resolve each distinct address once — duplicates in the input share the same result.
    const uniqueAddresses = Array.from(new Set(addresses));
    const resultByAddress = new Map<string, BatchGeocodeResult>();

    for (const address of uniqueAddresses) {
      const cached = await getGeocodeCacheEntry(address);
      if (cached) {
        resultByAddress.set(address, {
          address,
          latitude: cached.latitude,
          longitude: cached.longitude,
          cached: true,
        });
        continue;
      }

      const result = await geocodeAddress(address);

      if (!result.ok) {
        // geocodeAddress already redacts upstream text before returning it —
        // this is a defensive second pass right at the response boundary.
        resultByAddress.set(address, {
          address,
          latitude: null,
          longitude: null,
          cached: false,
          error: redactSensitiveText(result.reason),
        });
      } else {
        await appendGeocodeCacheEntry(address, result.latitude, result.longitude);
        resultByAddress.set(address, {
          address,
          latitude: result.latitude,
          longitude: result.longitude,
          cached: false,
        });
      }

      // Only throttle after a live API call — cache hits above `continue` before this.
      await sleep(LIVE_CALL_DELAY_MS);
    }

    const results = addresses.map((address) => resultByAddress.get(address)!);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("[geocode/batch POST]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error batch geocoding addresses." },
      { status: 500 }
    );
  }
}
