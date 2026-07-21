import { NextRequest, NextResponse } from "next/server";
import { getGeocodeCacheEntry, appendGeocodeCacheEntry } from "@/lib/googleSheets";
import { geocodeAddress } from "@/lib/geocoding";

export async function POST(request: NextRequest) {
  let body: { address?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = body.address?.trim();
  if (!address) {
    return NextResponse.json({ error: "address is required" }, { status: 400 });
  }

  try {
    const cached = await getGeocodeCacheEntry(address);
    if (cached) {
      return NextResponse.json({ latitude: cached.latitude, longitude: cached.longitude, cached: true });
    }

    const result = await geocodeAddress(address);

    if (!result.ok) {
      // "no_results" is a valid answer for a well-formed request (200); an
      // "api_error" means the call itself failed (bad key/quota/network) and
      // is surfaced as an upstream failure (502). Neither is cached.
      const status = result.kind === "no_results" ? 200 : 502;
      return NextResponse.json({ latitude: null, longitude: null, error: result.reason }, { status });
    }

    await appendGeocodeCacheEntry(address, result.latitude, result.longitude);

    return NextResponse.json({ latitude: result.latitude, longitude: result.longitude, cached: false });
  } catch (err) {
    console.error("[geocode POST]", err);
    return NextResponse.json(
      {
        latitude: null,
        longitude: null,
        error: err instanceof Error ? err.message : "Unknown error geocoding address.",
      },
      { status: 500 }
    );
  }
}
