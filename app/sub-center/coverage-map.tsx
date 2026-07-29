"use client";

// Self-contained Map view for Sub Center > Coverage. Deliberately duplicates
// (rather than shares with) app/map/page.tsx's fetch/geocode/service-area
// pipeline — that page runs on Leaflet, this one is the first Google Maps
// usage in the app. A shared hook can be extracted later once this view is
// live and proven; see the Coverage Map design doc for the reasoning.

import { useEffect, useMemo, useRef, useState } from "react";
import { APIProvider, Circle, InfoWindow, Map as GoogleMap, useMapsLibrary } from "@vis.gl/react-google-maps";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const GEOCODE_BATCH_SIZE = 25; // addresses per /api/geocode/batch call

// Same NJ / NYC / tri-state box used by app/map/page.tsx's SERVICE_AREA_* and
// GoogleAddressAutocompleteInput's autocomplete bias — accounts outside this
// are almost always bad geocodes rather than real out-of-territory accounts.
const SERVICE_AREA_LAT_MIN = 38.5;
const SERVICE_AREA_LAT_MAX = 42.5;
const SERVICE_AREA_LNG_MIN = -76.5;
const SERVICE_AREA_LNG_MAX = -72.5;

const SERVICE_AREA_BOUNDS = {
  south: SERVICE_AREA_LAT_MIN,
  north: SERVICE_AREA_LAT_MAX,
  west: SERVICE_AREA_LNG_MIN,
  east: SERVICE_AREA_LNG_MAX,
};

const DEFAULT_CENTER = { lat: 40.8584, lng: -74.1638 };
const DEFAULT_ZOOM = 9;

const CLOSEST_SUB_COUNT = 5;

function isInServiceArea(latitude: number, longitude: number) {
  return (
    latitude >= SERVICE_AREA_LAT_MIN &&
    latitude <= SERVICE_AREA_LAT_MAX &&
    longitude >= SERVICE_AREA_LNG_MIN &&
    longitude <= SERVICE_AREA_LNG_MAX
  );
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const EARTH_RADIUS_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return EARTH_RADIUS_MILES * 2 * Math.asin(Math.sqrt(h));
}

type AnyRow = Record<string, unknown>;

type MapAccountRecord = {
  id: string;
  name: string;
  subcontractor: string;
  status: string;
  city: string;
  zip: string;
  fullAddress: string;
  latitude: number | null;
  longitude: number | null;
};

type AccountsApiResponse = {
  success?: boolean;
  error?: string;
  accounts?: AnyRow[];
  data?: AnyRow[];
  rows?: AnyRow[];
};

function cleanText(value: unknown, fallback = "") {
  if (value === null || value === undefined) return fallback;
  return String(value).trim() || fallback;
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/\s+/g, "").replace(/_/g, "");
}

function getValue(row: AnyRow, possibleKeys: string[]) {
  for (const key of possibleKeys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== "") {
      return row[key];
    }
  }

  const entries = Object.entries(row).map(([key, value]) => ({
    key: normalizeKey(key),
    value,
  }));

  for (const possibleKey of possibleKeys) {
    const wanted = normalizeKey(possibleKey);
    const found = entries.find((entry) => entry.key === wanted);

    if (found && found.value !== undefined && found.value !== null && found.value !== "") {
      return found.value;
    }
  }

  return "";
}

function parseNumber(value: unknown): number | null {
  const text = cleanText(value);
  if (!text) return null;
  const number = Number(text.replace(",", "."));
  if (Number.isNaN(number)) return null;
  return number;
}

function createIdFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "-");
}

// Mirrors coverage.tsx's isServicedStatus — kept as a separate local copy per
// the reduced scope for this pass (no shared helper extraction yet).
function isServicedStatus(status: unknown): boolean {
  const value = cleanText(status).toLowerCase();
  if (!value) return true;
  if (value.includes("cancel") || value.includes("lost") || value.includes("terminated") || value.includes("closed")) {
    return false;
  }
  if (value.includes("pause") || value.includes("hold") || value.includes("suspended")) return false;
  if (value.includes("90") || value.includes("over ninety") || value.includes("old")) return false;
  return true;
}

function getLoadedAccounts(data: AccountsApiResponse | AnyRow[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.accounts)) return data.accounts;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.rows)) return data.rows;
  return [];
}

function mapAccount(row: AnyRow): MapAccountRecord {
  const name = cleanText(
    getValue(row, ["Account Name", "accountName", "Account", "account", "Customer", "customer", "Name", "name"]),
    "Unnamed Account"
  );

  const id = cleanText(getValue(row, ["ID", "id", "Account ID", "accountId", "account_id"]), createIdFromName(name));

  const address = cleanText(
    getValue(row, [
      "Address",
      "address",
      "Street Address",
      "streetAddress",
      "Service Address",
      "serviceAddress",
      "Location Address",
      "locationAddress",
    ])
  );

  const city = cleanText(getValue(row, ["City", "city"]));
  const state = cleanText(getValue(row, ["State", "state"]));
  const zip = cleanText(getValue(row, ["Zip", "zip", "ZIP", "Zip Code", "zipCode", "Postal Code"]));

  const fullAddress =
    cleanText(
      getValue(row, ["Full Address", "fullAddress", "Complete Address", "completeAddress", "Google Address", "googleAddress"])
    ) || [address, city, state, zip].filter(Boolean).join(", ");

  const latitude = parseNumber(getValue(row, ["Latitude", "latitude", "Lat", "lat", "Google Latitude", "googleLatitude"]));
  const longitude = parseNumber(
    getValue(row, ["Longitude", "longitude", "Lng", "lng", "Long", "long", "Google Longitude", "googleLongitude"])
  );

  return {
    id,
    name,
    subcontractor: cleanText(
      getValue(row, [
        "Subcontractor",
        "subcontractor",
        "Sub",
        "sub",
        "Assigned Subcontractor",
        "assignedSubcontractor",
        "Cleaner",
        "cleaner",
      ]),
      "Unassigned"
    ),
    status: cleanText(getValue(row, ["Status", "status", "Account Status", "accountStatus"]), "N/A"),
    city,
    zip,
    fullAddress,
    latitude,
    longitude,
  };
}

async function fetchMapAccounts(): Promise<MapAccountRecord[]> {
  const response = await fetch("/api/accounts?action=getMapAccounts");
  const result = (await response.json()) as AccountsApiResponse | AnyRow[];

  if (!response.ok || (!Array.isArray(result) && result.success === false)) {
    throw new Error(!Array.isArray(result) && result.error ? result.error : "Could not load accounts.");
  }

  return getLoadedAccounts(result)
    .map(mapAccount)
    .filter((account) => account.name !== "Unnamed Account" && account.fullAddress && isServicedStatus(account.status));
}

type SubCoverageRecord = {
  subcontractor: string;
  distanceMiles: number;
  accountCount: number;
  nearestAccountName: string;
  nearestAccountAddress: string;
  nearestAccountCoords: { lat: number; lng: number };
};

// Distance bands for the proximity search — red (effectively on top of an
// existing job) fading through orange/yellow down to green/gray for
// anything far away. Applied both to the ranked list dots and the map
// markers below so the two stay visually in sync.
const PROXIMITY_BANDS: Array<{ maxMiles: number; color: string; label: string }> = [
  { maxMiles: 1, color: "#dc2626", label: "< 1 mi" },
  { maxMiles: 3, color: "#f97316", label: "1-3 mi" },
  { maxMiles: 5, color: "#eab308", label: "3-5 mi" },
  { maxMiles: 10, color: "#65a30d", label: "5-10 mi" },
  { maxMiles: Infinity, color: "#6b7280", label: "10+ mi" },
];

function proximityColor(distanceMiles: number): string {
  return (PROXIMITY_BANDS.find((band) => distanceMiles < band.maxMiles) ?? PROXIMITY_BANDS[PROXIMITY_BANDS.length - 1]).color;
}

// Subcontractors don't have a reliable geocoded home address (their
// free-text `address` field is often blank or just a mailing address, not
// where they actually work), so "closest sub" is inferred from the
// coordinates of the accounts already assigned to them instead.
//
// Ranking uses each sub's SINGLE NEAREST assigned account, not the centroid
// of all their accounts: a sub who already services one job half a mile
// from the searched address is a strong, concrete signal even if their
// other accounts are scattered across the territory, whereas an averaged
// center point can land nowhere near any real job and would bury that
// nearby account under a misleading aggregate distance. accountCount is
// still surfaced per sub so a single-account match can be told apart from
// one backed by a large existing territory.
//
// `accounts` must already be filtered to those with valid, in-service-area
// coordinates by the caller (see geocodedServiceAreaAccounts below) — this
// is what excludes both unresolved geocodes (ZERO_RESULTS) and the known
// outlier/bad-coordinate accounts from skewing results.
function findClosestSubs(point: { lat: number; lng: number }, accounts: MapAccountRecord[], limit: number): SubCoverageRecord[] {
  const bySub = new Map<
    string,
    { accountCount: number; nearestAccount: MapAccountRecord; nearestDistance: number }
  >();

  for (const account of accounts) {
    if (account.subcontractor === "Unassigned" || account.latitude === null || account.longitude === null) continue;

    const distance = haversineMiles(point, { lat: account.latitude, lng: account.longitude });
    const existing = bySub.get(account.subcontractor);

    if (!existing) {
      bySub.set(account.subcontractor, { accountCount: 1, nearestAccount: account, nearestDistance: distance });
      continue;
    }

    existing.accountCount += 1;
    if (distance < existing.nearestDistance) {
      existing.nearestAccount = account;
      existing.nearestDistance = distance;
    }
  }

  return Array.from(bySub.entries())
    .map(([subcontractor, entry]) => ({
      subcontractor,
      distanceMiles: entry.nearestDistance,
      accountCount: entry.accountCount,
      nearestAccountName: entry.nearestAccount.name,
      nearestAccountAddress: entry.nearestAccount.fullAddress,
      nearestAccountCoords: { lat: entry.nearestAccount.latitude as number, lng: entry.nearestAccount.longitude as number },
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, limit);
}

// NOTE: google.maps.visualization.HeatmapLayer was removed in Maps
// JavaScript API v3.65 (May 2026) — Google's own replacement recommendation
// (deck.gl) was rejected here to avoid a new WebGL dependency family. Density
// is rendered instead as weighted circles ("bubble map"): one per town/zip
// cluster, radius + opacity scaled by account count, matching the same
// town/zip grouping key already used by coverage.tsx's "By Town" view.
const MIN_RADIUS_METERS = 700;
const MAX_RADIUS_METERS = 6000;
const MIN_FILL_OPACITY = 0.25;
const MAX_FILL_OPACITY = 0.6;

type TownCluster = {
  key: string;
  town: string;
  isZipOnly: boolean;
  totalAccounts: number;
  center: { lat: number; lng: number };
  subs: Array<{ subcontractor: string; count: number }>;
};

// Same grouping key as coverage.tsx's buildTownCoverage: city if present,
// else zip. Accounts with neither are skipped (nothing to plot). Center is
// the centroid of that town's geocoded accounts.
function buildTownClusters(records: Array<MapAccountRecord & { city: string; zip: string }>): TownCluster[] {
  const byTown = new Map<
    string,
    { town: string; isZipOnly: boolean; latSum: number; lngSum: number; total: number; subs: Map<string, number> }
  >();

  for (const record of records) {
    if (record.latitude === null || record.longitude === null) continue;
    if (!record.city && !record.zip) continue;

    const key = record.city ? `city:${record.city}` : `zip:${record.zip}`;
    const entry = byTown.get(key) ?? {
      town: record.city || record.zip,
      isZipOnly: !record.city,
      latSum: 0,
      lngSum: 0,
      total: 0,
      subs: new Map<string, number>(),
    };

    entry.latSum += record.latitude;
    entry.lngSum += record.longitude;
    entry.total += 1;
    entry.subs.set(record.subcontractor, (entry.subs.get(record.subcontractor) ?? 0) + 1);

    byTown.set(key, entry);
  }

  return Array.from(byTown.entries())
    .map(([key, entry]) => ({
      key,
      town: entry.town,
      isZipOnly: entry.isZipOnly,
      totalAccounts: entry.total,
      center: { lat: entry.latSum / entry.total, lng: entry.lngSum / entry.total },
      subs: Array.from(entry.subs.entries())
        .map(([subcontractor, count]) => ({ subcontractor, count }))
        .sort((a, b) => b.count - a.count || a.subcontractor.localeCompare(b.subcontractor)),
    }))
    .sort((a, b) => b.totalAccounts - a.totalAccounts);
}

function TownBubbles({ clusters }: { clusters: TownCluster[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const maxCount = clusters.reduce((max, c) => Math.max(max, c.totalAccounts), 1);
  const selected = clusters.find((c) => c.key === selectedKey) ?? null;

  return (
    <>
      {clusters.map((cluster) => {
        const weight = cluster.totalAccounts / maxCount;
        const radius = MIN_RADIUS_METERS + weight * (MAX_RADIUS_METERS - MIN_RADIUS_METERS);
        const fillOpacity = MIN_FILL_OPACITY + weight * (MAX_FILL_OPACITY - MIN_FILL_OPACITY);

        return (
          <Circle
            key={cluster.key}
            center={cluster.center}
            radius={radius}
            fillColor="#2563eb"
            fillOpacity={fillOpacity}
            strokeColor="#1d4ed8"
            strokeOpacity={0.7}
            strokeWeight={1.5}
            clickable
            onClick={() => setSelectedKey(cluster.key)}
          />
        );
      })}

      {selected ? (
        <InfoWindow position={selected.center} onCloseClick={() => setSelectedKey(null)}>
          <div className="max-w-[220px] text-sm">
            <p className="font-black text-gray-900">
              {selected.town}
              {selected.isZipOnly ? " (zip)" : ""}
            </p>
            <p className="mt-1 text-xs font-bold text-gray-600">
              {selected.totalAccounts} account{selected.totalAccounts === 1 ? "" : "s"}
            </p>
            <ul className="mt-2 space-y-0.5 text-xs text-gray-700">
              {selected.subs.map((sub) => (
                <li key={sub.subcontractor}>
                  {sub.subcontractor}: {sub.count}
                </li>
              ))}
            </ul>
          </div>
        </InfoWindow>
      ) : null}
    </>
  );
}

// A single marker for the searched address itself — dark fill with a white
// ring so it reads as "you are here" against the colored sub markers.
function SearchPointMarker({ point }: { point: { lat: number; lng: number } }) {
  return (
    <Circle
      center={point}
      radius={220}
      fillColor="#111827"
      fillOpacity={0.9}
      strokeColor="#ffffff"
      strokeOpacity={1}
      strokeWeight={2}
      clickable={false}
    />
  );
}

// One colored dot per ranked sub, placed at that sub's single nearest
// account (the same account driving its ranking in the list below) rather
// than at every account they own — keeps the overlay readable and ties
// each marker directly to the evidence behind its ranking.
function SubProximityMarkers({ records }: { records: SubCoverageRecord[] }) {
  const [selectedSub, setSelectedSub] = useState<string | null>(null);
  const selected = records.find((record) => record.subcontractor === selectedSub) ?? null;

  return (
    <>
      {records.map((record) => (
        <Circle
          key={record.subcontractor}
          center={record.nearestAccountCoords}
          radius={300}
          fillColor={proximityColor(record.distanceMiles)}
          fillOpacity={0.85}
          strokeColor="#ffffff"
          strokeOpacity={1}
          strokeWeight={1.5}
          clickable
          onClick={() => setSelectedSub(record.subcontractor)}
        />
      ))}

      {selected ? (
        <InfoWindow position={selected.nearestAccountCoords} onCloseClick={() => setSelectedSub(null)}>
          <div className="max-w-[220px] text-sm">
            <p className="font-black text-gray-900">{selected.subcontractor}</p>
            <p className="mt-1 text-xs font-bold text-gray-600">{selected.distanceMiles.toFixed(1)} mi away</p>
            <p className="mt-1 text-xs text-gray-700">
              Nearest job: {selected.nearestAccountName} — {selected.nearestAccountAddress}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {selected.accountCount} account{selected.accountCount === 1 ? "" : "s"} total
            </p>
          </div>
        </InfoWindow>
      ) : null}
    </>
  );
}

type SubDistanceFinderProps = {
  searchPoint: { lat: number; lng: number } | null;
  onSearchPointChange: (point: { lat: number; lng: number } | null) => void;
  closestSubs: SubCoverageRecord[];
  isGeocodingAccounts: boolean;
};

// Address search for "closest subcontractors to this point." Must render
// inside <APIProvider> — uses useMapsLibrary("places") rather than its own
// <Script> tag (the pattern GoogleAddressAutocompleteInput uses elsewhere)
// so it reuses the same Maps JS bootstrap APIProvider already loads for the
// map itself, instead of injecting a second, competing script tag.
//
// The search point itself is lifted to the parent (CoverageMap) so the map
// can plot proximity markers for it — this component stays focused on the
// input widget and the ranked-list readout; ranking is computed by the
// parent from the same geocoded account data driving the rest of the map.
function SubDistanceFinder({ searchPoint, onSearchPointChange, closestSubs, isGeocodingAccounts }: SubDistanceFinderProps) {
  const placesLibrary = useMapsLibrary("places");

  const inputRef = useRef<HTMLInputElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);

  const [addressInput, setAddressInput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!placesLibrary || !inputRef.current || autocompleteRef.current) return;

    const { Autocomplete } = placesLibrary;

    const autocomplete = new Autocomplete(inputRef.current, {
      componentRestrictions: { country: "us" },
      fields: ["formatted_address", "geometry"],
      bounds: SERVICE_AREA_BOUNDS,
    });

    autocompleteRef.current = autocomplete;

    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const latitude = place.geometry?.location?.lat();
      const longitude = place.geometry?.location?.lng();

      if (latitude === undefined || longitude === undefined) {
        setErrorMessage("Could not determine coordinates for that address.");
        return;
      }

      setErrorMessage("");
      setAddressInput(place.formatted_address || inputRef.current?.value || "");
      onSearchPointChange({ lat: latitude, lng: longitude });
    });

    return () => {
      window.google?.maps?.event?.removeListener(listener);
      autocompleteRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placesLibrary]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <label htmlFor="coverage-map-address-search" className="text-sm font-bold text-gray-900">
        Find closest subcontractors
      </label>
      <input
        id="coverage-map-address-search"
        ref={inputRef}
        value={addressInput}
        onChange={(event) => setAddressInput(event.target.value)}
        placeholder={placesLibrary ? "Enter an address..." : "Loading address search..."}
        disabled={!placesLibrary}
        autoComplete="off"
        className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
      />

      {errorMessage ? <p className="mt-2 text-xs font-bold text-red-700">{errorMessage}</p> : null}

      {searchPoint && isGeocodingAccounts ? (
        <p className="mt-2 text-xs font-bold text-blue-700">
          Still geocoding account locations in the background — results below may be incomplete until that finishes.
        </p>
      ) : null}

      {searchPoint ? (
        closestSubs.length > 0 ? (
          <>
            <ul className="mt-3 space-y-1.5">
              {closestSubs.map((sub) => (
                <li key={sub.subcontractor} className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: proximityColor(sub.distanceMiles) }}
                      aria-hidden
                    />
                    <span className="truncate font-semibold text-gray-900">{sub.subcontractor}</span>
                    <span className="shrink-0 text-xs font-medium text-gray-500">
                      ({sub.accountCount} acct{sub.accountCount === 1 ? "" : "s"})
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs font-bold text-gray-600">
                    {sub.distanceMiles.toFixed(1)} mi
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] font-semibold leading-relaxed text-gray-400">
              Ranked by each sub&apos;s nearest existing account to the searched address.
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs font-bold text-gray-500">
            No subcontractors with a validly-geocoded assigned account were found nearby.
          </p>
        )
      ) : null}
    </div>
  );
}

export default function CoverageMap() {
  const [accounts, setAccounts] = useState<MapAccountRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [subFilter, setSubFilter] = useState("All Subs");

  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [geocodingProgress, setGeocodingProgress] = useState<{ total: number; done: number } | null>(null);

  const [searchPoint, setSearchPoint] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setErrorMessage("");
      try {
        const result = await fetchMapAccounts();
        if (!cancelled) setAccounts(result);
      } catch (error) {
        if (!cancelled) setErrorMessage(error instanceof Error ? error.message : "Could not load map data.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Geocode accounts that have an address but no lat/lng, via the shared
  // server-side geocode cache (/api/geocode/batch backed by GeocodeCache) —
  // results are shared across all users/sessions, including anyone who has
  // already visited the Leaflet /map page.
  useEffect(() => {
    if (accounts.length === 0) return;

    const toFetch = Array.from(
      new Set(accounts.filter((a) => a.latitude === null && a.longitude === null && a.fullAddress).map((a) => a.fullAddress))
    );

    if (toFetch.length === 0) return;

    let cancelled = false;

    async function runBatches() {
      setGeocodingProgress({ total: toFetch.length, done: 0 });

      for (let i = 0; i < toFetch.length; i += GEOCODE_BATCH_SIZE) {
        if (cancelled) return;
        const chunk = toFetch.slice(i, i + GEOCODE_BATCH_SIZE);

        try {
          const res = await fetch("/api/geocode/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ addresses: chunk }),
          });

          if (res.ok) {
            const data = (await res.json()) as {
              results: Array<{ address: string; latitude: number | null; longitude: number | null }>;
            };

            if (!cancelled) {
              setGeocodedCoords((prev) => {
                const next = { ...prev };
                for (const r of data.results) {
                  next[r.address] = r.latitude !== null && r.longitude !== null ? { lat: r.latitude, lng: r.longitude } : null;
                }
                return next;
              });
            }
          }
        } catch {
          // Network error — skip this chunk; will retry next load
        }

        if (!cancelled) {
          setGeocodingProgress({ total: toFetch.length, done: Math.min(i + GEOCODE_BATCH_SIZE, toFetch.length) });
        }
      }

      if (!cancelled) setGeocodingProgress(null);
    }

    runBatches();

    return () => {
      cancelled = true;
    };
  }, [accounts]);

  const accountsWithCoords = useMemo<MapAccountRecord[]>(() => {
    return accounts.map((account) => {
      if (account.latitude !== null && account.longitude !== null) return account;
      const geocoded = geocodedCoords[account.fullAddress];
      if (!geocoded) return account;
      return { ...account, latitude: geocoded.lat, longitude: geocoded.lng };
    });
  }, [accounts, geocodedCoords]);

  const subOptions = useMemo(() => {
    const subs = Array.from(new Set(accounts.map((a) => a.subcontractor).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    return ["All Subs", ...subs];
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    if (subFilter === "All Subs") return accountsWithCoords;
    return accountsWithCoords.filter((a) => a.subcontractor === subFilter);
  }, [accountsWithCoords, subFilter]);

  const plottedAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => a.latitude !== null && a.longitude !== null && isInServiceArea(a.latitude, a.longitude));
  }, [filteredAccounts]);

  const townClusters = useMemo(() => buildTownClusters(plottedAccounts), [plottedAccounts]);

  const missingPinCount = filteredAccounts.filter((a) => a.latitude === null || a.longitude === null).length;

  const outOfServiceAreaAccounts = useMemo(() => {
    return filteredAccounts.filter((a) => a.latitude !== null && a.longitude !== null && !isInServiceArea(a.latitude, a.longitude));
  }, [filteredAccounts]);

  // Validly-geocoded, in-service-area accounts across ALL subs — independent
  // of the subFilter dropdown above, since "closest sub" is a global query
  // ("who's nearest, out of everyone") rather than one scoped to whichever
  // single sub is currently selected for the town-bubble map. This is also
  // what excludes the known bad-coordinate accounts (unresolved ZERO_RESULTS
  // geocodes, which never get lat/lng at all, and the outlier accounts whose
  // coordinates fall outside the service-area box) from skewing rankings.
  const geocodedServiceAreaAccounts = useMemo(() => {
    return accountsWithCoords.filter((a) => a.latitude !== null && a.longitude !== null && isInServiceArea(a.latitude, a.longitude));
  }, [accountsWithCoords]);

  const closestSubs = useMemo(() => {
    if (!searchPoint) return [];
    return findClosestSubs(searchPoint, geocodedServiceAreaAccounts, CLOSEST_SUB_COUNT);
  }, [searchPoint, geocodedServiceAreaAccounts]);

  if (!GOOGLE_MAPS_API_KEY) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm font-bold text-amber-800">
        Google Maps API key is not configured, so the map view is unavailable. Use By Sub or By Town instead.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select
          value={subFilter}
          onChange={(event) => setSubFilter(event.target.value)}
          className="min-h-[44px] rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
        >
          {subOptions.map((sub) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </select>

        <span className="text-xs font-bold text-gray-500">
          {isLoading
            ? "Loading accounts..."
            : `${townClusters.length} town${townClusters.length === 1 ? "" : "s"} / ${plottedAccounts.length} account${
                plottedAccounts.length === 1 ? "" : "s"
              } on map`}
        </span>
      </div>

      {errorMessage ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">{errorMessage}</div>
      ) : null}

      {!isLoading && geocodingProgress !== null ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800">
          Auto-geocoding addresses: {geocodingProgress.done} / {geocodingProgress.total} done — the map updates as each address
          resolves. Results are cached so this only runs once per address.
        </div>
      ) : !isLoading && missingPinCount > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
          {missingPinCount} account{missingPinCount === 1 ? "" : "s"} could not be geocoded and are excluded from the map.
        </div>
      ) : null}

      {!isLoading && outOfServiceAreaAccounts.length > 0 ? (
        <details className="rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs font-bold text-orange-800">
          <summary className="cursor-pointer select-none">
            {outOfServiceAreaAccounts.length} account{outOfServiceAreaAccounts.length === 1 ? "" : "s"} have coordinates outside
            the expected NJ / NYC service area and are excluded from the map. Their address likely needs correcting — click
            to view.
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 font-semibold">
            {outOfServiceAreaAccounts.map((account) => (
              <li key={account.id}>
                {account.name} — {account.fullAddress}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <SubDistanceFinder
          searchPoint={searchPoint}
          onSearchPointChange={setSearchPoint}
          closestSubs={closestSubs}
          isGeocodingAccounts={geocodingProgress !== null}
        />

        <div className="h-[68vh] min-h-[460px] w-full overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
          {isLoading ? (
            <div className="flex h-full items-center justify-center text-center text-gray-600">Loading account locations for the map...</div>
          ) : (
            <GoogleMap
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={DEFAULT_ZOOM}
              gestureHandling="greedy"
              disableDefaultUI={false}
              style={{ width: "100%", height: "100%" }}
            >
              <TownBubbles clusters={townClusters} />
              {searchPoint ? <SearchPointMarker point={searchPoint} /> : null}
              {searchPoint && closestSubs.length > 0 ? <SubProximityMarkers records={closestSubs} /> : null}
            </GoogleMap>
          )}
        </div>
      </APIProvider>
    </div>
  );
}
