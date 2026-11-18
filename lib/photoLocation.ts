// Where a photo was taken: the rules and words the crew screen (CW Now), the
// office Photos page and the server share. Plain TS, safe in the browser.
// Distances use the same math as the Map page and Accounts Center "Near
// Account" (app/lib/distance.ts). Server side: lib/pg/crew-photos.ts (the
// check saved with each crew photo) and lib/pg/nearby-accounts.ts.
//
// Location is read once, when a photo is added. Never tracked.

import { distanceInMiles } from "@/app/lib/distance";

export type GeoPoint = { lat: number; lng: number };
export type PhoneLocation = GeoPoint & { accuracyM: number };

/** A crew photo is on site within this many feet of the account's map point (plus the phone's accuracy, up to MAX_ACCURACY_ALLOWANCE_FT). */
export const ON_SITE_FEET = 300;
/** The phone's accuracy counts up to this much: a "within 2 miles" reading never makes a photo on site. */
export const MAX_ACCURACY_ALLOWANCE_FT = 330;
/** "Looks like <Account>": accounts this close to where the photo was taken. */
export const NEAR_ACCOUNT_FEET = 500;
/** CW Now: "You seem to be at <Other>" only when this link's account is farther than this. */
export const FAR_FROM_LINK_FEET = 1000;

const FEET_PER_METER = 3.28084;
export const metersToFeet = (meters: number) => meters * FEET_PER_METER;

/** Feet between two points (same math as Near Account). */
export function feetBetween(a: GeoPoint, b: GeoPoint): number {
  const miles = distanceInMiles({ latitude: a.lat, longitude: a.lng }, { latitude: b.lat, longitude: b.lng });
  return (miles ?? 0) * 5280;
}

export const isGeoPoint = (lat: unknown, lng: unknown): boolean =>
  typeof lat === "number" && typeof lng === "number" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** "on_site" / "off_site" / "no_location" (the phone gave none) / "no_site" (the account is not on the map). */
export type SiteCheck = "on_site" | "off_site" | "no_location" | "no_site";
export const isSiteCheck = (value: unknown): value is SiteCheck => value === "on_site" || value === "off_site" || value === "no_location" || value === "no_site";

export function siteCheckOf(photo: PhoneLocation | null, site: GeoPoint | null): { check: SiteCheck; distanceFt: number | null } {
  if (!photo) return { check: "no_location", distanceFt: null };
  if (!site) return { check: "no_site", distanceFt: null };
  const distanceFt = feetBetween(photo, site);
  const allowance = Math.min(metersToFeet(Math.max(0, photo.accuracyM)), MAX_ACCURACY_ALLOWANCE_FT);
  return { check: distanceFt <= ON_SITE_FEET + allowance ? "on_site" : "off_site", distanceFt };
}

/** "600 ft" under a tenth of a mile, else "0.4 mi". */
export function distanceText(feet: number): string {
  if (feet < 528) return `${Math.max(10, Math.round(feet / 10) * 10)} ft`;
  return `${(feet / 5280).toFixed(feet < 52800 ? 1 : 0)} mi`;
}

/** The staff badge (never shown to a customer). */
export function siteBadge(check: string, distanceM: number | null | undefined): { icon: string; text: string; tone: "good" | "warn" | "unknown" } | null {
  if (check === "on_site") return { icon: "✅", text: "On site", tone: "good" };
  if (check === "off_site") return { icon: "⚠️", text: distanceM != null ? `${distanceText(metersToFeet(distanceM))} from site` : "Not on site", tone: "warn" };
  if (check === "no_location") return { icon: "❓", text: "No location", tone: "unknown" };
  if (check === "no_site") return { icon: "❓", text: "Site not on the map", tone: "unknown" };
  return null;
}

/** The Photos page filter: ⚠️ and ❓ photos. */
export const LOCATION_FILTER = "location";

/* ---------- the phone (browser only) ---------- */

/** The note shown before the phone first asks (crew-facing: never "sub"). */
export const LOCATION_NOTE = "Allow location so we can show this photo was taken on site / Permite la ubicación para mostrar que la foto se tomó en el sitio";

/** Where the phone is now, high accuracy, about 10 seconds at most. null when denied, unavailable or too slow: the photo still goes. */
export function phoneLocation(timeoutMs = 10_000): Promise<PhoneLocation | null> {
  return new Promise((resolve) => {
    try {
      if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
      let done = false;
      const finish = (value: PhoneLocation | null) => {
        if (done) return;
        done = true;
        resolve(value);
      };
      // The browser's own timeout does not count the time the permission question is open.
      const timer = setTimeout(() => finish(null), timeoutMs + 20_000);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timer);
          const { latitude, longitude, accuracy } = position.coords;
          finish(isGeoPoint(latitude, longitude) ? { lat: latitude, lng: longitude, accuracyM: Number.isFinite(accuracy) ? accuracy : 9999 } : null);
        },
        () => {
          clearTimeout(timer);
          finish(null);
        },
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 }
      );
    } catch {
      resolve(null);
    }
  });
}

/** Has the phone already said yes or no? "prompt" = the note should show first. */
export async function locationPermission(): Promise<"granted" | "denied" | "prompt" | "unknown"> {
  try {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) return "unknown";
    const status = await navigator.permissions.query({ name: "geolocation" as PermissionName });
    return status.state;
  } catch {
    return "unknown";
  }
}
