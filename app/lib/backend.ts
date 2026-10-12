export function getGoogleMapsUrl(address: string | null | undefined): string {
  if (!address) return "#";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
