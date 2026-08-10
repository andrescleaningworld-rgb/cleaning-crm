export type Coordinates = { latitude: number; longitude: number };

type CoordinatesOrNull = {
  latitude: number | null;
  longitude: number | null;
};

// Haversine great-circle distance in miles. Shared by the Map page and the
// Accounts Center "Near Account" filter so both use the exact same math.
export function distanceInMiles(
  from: Coordinates | null,
  to: CoordinatesOrNull
): number | null {
  if (!from || to.latitude === null || to.longitude === null) {
    return null;
  }

  const earthRadiusMiles = 3958.8;
  const fromLat = (from.latitude * Math.PI) / 180;
  const toLat = (to.latitude * Math.PI) / 180;
  const latDifference = ((to.latitude - from.latitude) * Math.PI) / 180;
  const lngDifference = ((to.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(latDifference / 2) * Math.sin(latDifference / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDifference / 2) *
      Math.sin(lngDifference / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

export function formatMiles(value: number | null): string {
  if (value === null) return "";
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}
