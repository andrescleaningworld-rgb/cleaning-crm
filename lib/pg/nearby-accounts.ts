// Accounts on the map (the geocoded points every account already has,
// accounts.latitude_raw / longitude_raw, as the Map page and "Near Account"
// use them), for "where was this photo taken?". Server only. Rules and
// distances: lib/photoLocation.ts.

import { getSql } from "@/lib/db";
import { accountLive } from "@/lib/pg/account-live";
import { feetBetween, isGeoPoint, type GeoPoint } from "@/lib/photoLocation";

type PointRow = { id: string; account_name: string; address: string; city: string; zip: string; lat: string; lng: string };

const toPoint = (row: Pick<PointRow, "lat" | "lng">): GeoPoint | null => {
  const lat = Number(row.lat);
  const lng = Number(row.lng);
  return row.lat !== "" && row.lng !== "" && isGeoPoint(lat, lng) ? { lat, lng } : null;
};

/** One account's map point, name and address (for the photo stamp and the on-site check). */
export async function accountPlace(accountId: string): Promise<{ point: GeoPoint | null; name: string; address: string } | null> {
  const rows = (await getSql()`
    SELECT id, btrim(account_name) AS account_name, btrim(address) AS address, btrim(city) AS city, btrim(zip) AS zip,
           btrim(COALESCE(latitude_raw, '')) AS lat, btrim(COALESCE(longitude_raw, '')) AS lng
    FROM accounts WHERE id = ${accountId} LIMIT 1
  `) as PointRow[];
  const row = rows[0];
  if (!row) return null;
  // The address field usually has the town already; add it only when it doesn't.
  const town = [row.city, row.zip].filter(Boolean).join(" ");
  const address = town && !row.address.toLowerCase().includes(row.city.toLowerCase()) ? `${row.address}, ${town}` : row.address;
  return { point: toPoint(row), name: row.account_name, address };
}

export type NearbyAccount = { accountId: string; accountName: string; address: string; feet: number };

/**
 * Active accounts within `radiusFt` of a point, nearest first (2+ in the same
 * building come back together). Cancelled, test and deleted accounts are
 * left out.
 */
export async function nearbyAccounts(at: GeoPoint, radiusFt: number): Promise<NearbyAccount[]> {
  // A rough box first (about 0.01° ≈ 3,600 ft), then the exact distance.
  const box = Math.max(0.002, (radiusFt / 364_000) * 1.5);
  const rows = (await getSql().query(
    `SELECT id, btrim(account_name) AS account_name, btrim(address) AS address, '' AS city, '' AS zip,
            btrim(latitude_raw) AS lat, btrim(longitude_raw) AS lng
     FROM accounts a
     WHERE a.id IS NOT NULL AND NOT a.is_test AND ${accountLive("a")} AND a.status_key NOT IN ('cancelled', 'canceled')
       AND btrim(COALESCE(a.latitude_raw, '')) ~ '^-?[0-9.]+$' AND btrim(COALESCE(a.longitude_raw, '')) ~ '^-?[0-9.]+$'
       AND btrim(a.latitude_raw)::double precision BETWEEN $1 AND $2
       AND btrim(a.longitude_raw)::double precision BETWEEN $3 AND $4`,
    [at.lat - box, at.lat + box, at.lng - box * 1.4, at.lng + box * 1.4]
  )) as PointRow[];
  return rows
    .map((row) => {
      const point = toPoint(row);
      return point ? { accountId: row.id, accountName: row.account_name, address: row.address, feet: Math.round(feetBetween(at, point)) } : null;
    })
    .filter((entry): entry is NearbyAccount => entry !== null && entry.feet <= radiusFt)
    .sort((a, b) => a.feet - b.feet);
}
