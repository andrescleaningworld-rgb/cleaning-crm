// Staff only (proxy.ts admin gate, and the logged-in check here): Photos ->
// Add photos, "📍 Looks like <Account> — right?". For each place a photo was
// taken (its EXIF GPS, or the phone's location at upload), the active
// accounts within ~500 ft, nearest first (lib/pg/nearby-accounts.ts). The
// places come in the body, never in a web address, and are not saved.
//
// POST { points: [{ lat, lng }, …] }  (up to 200)
//   -> { success, results: [[{ accountId, accountName, address, feet }, …], …] }  same order

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { NEAR_ACCOUNT_FEET, isGeoPoint } from "@/lib/photoLocation";
import { nearbyAccounts, type NearbyAccount } from "@/lib/pg/nearby-accounts";

const MAX_POINTS = 200;

export async function POST(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
    const body = (await request.json().catch(() => ({}))) as { points?: unknown };
    const points = Array.isArray(body.points) ? body.points.slice(0, MAX_POINTS) : [];
    // The same place (one batch from one spot) is looked up once.
    const cache = new Map<string, Promise<NearbyAccount[]>>();
    const results = await Promise.all(
      points.map((entry) => {
        const point = (entry && typeof entry === "object" ? entry : {}) as { lat?: unknown; lng?: unknown };
        const lat = Number(point.lat);
        const lng = Number(point.lng);
        if (!isGeoPoint(lat, lng)) return Promise.resolve([] as NearbyAccount[]);
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (!cache.has(key)) cache.set(key, nearbyAccounts({ lat, lng }, NEAR_ACCOUNT_FEET));
        return cache.get(key)!;
      })
    );
    return NextResponse.json({ success: true, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[photo-index nearby]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not look up nearby accounts." }, { status: 500 });
  }
}
