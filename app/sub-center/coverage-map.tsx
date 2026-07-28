"use client";

// Self-contained Map view for Sub Center > Coverage. Deliberately duplicates
// (rather than shares with) app/map/page.tsx's fetch/geocode/service-area
// pipeline — that page runs on Leaflet, this one is the first Google Maps
// usage in the app. A shared hook can be extracted later once this view is
// live and proven; see the Coverage Map design doc for the reasoning.

import { useEffect, useMemo, useState } from "react";
import { APIProvider, Circle, InfoWindow, Map as GoogleMap } from "@vis.gl/react-google-maps";

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

const GEOCODE_BATCH_SIZE = 25; // addresses per /api/geocode/batch call

// Same NJ / NYC / tri-state box used by app/map/page.tsx's SERVICE_AREA_* and
// GoogleAddressAutocompleteInput's autocomplete bias — accounts outside this
// are almost always bad geocodes rather than real out-of-territory accounts.
const SERVICE_AREA_LAT_MIN = 38.5;
const SERVICE_AREA_LAT_MAX = 42.5;
const SERVICE_AREA_LNG_MIN = -76.5;
const SERVICE_AREA_LNG_MAX = -72.5;

const DEFAULT_CENTER = { lat: 40.8584, lng: -74.1638 };
const DEFAULT_ZOOM = 9;

function isInServiceArea(latitude: number, longitude: number) {
  return (
    latitude >= SERVICE_AREA_LAT_MIN &&
    latitude <= SERVICE_AREA_LAT_MAX &&
    longitude >= SERVICE_AREA_LNG_MIN &&
    longitude <= SERVICE_AREA_LNG_MAX
  );
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

export default function CoverageMap() {
  const [accounts, setAccounts] = useState<MapAccountRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [subFilter, setSubFilter] = useState("All Subs");

  const [geocodedCoords, setGeocodedCoords] = useState<Record<string, { lat: number; lng: number } | null>>({});
  const [geocodingProgress, setGeocodingProgress] = useState<{ total: number; done: number } | null>(null);

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

      <div className="h-[68vh] min-h-[460px] w-full overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-center text-gray-600">Loading account locations for the map...</div>
        ) : (
          <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
            <GoogleMap
              defaultCenter={DEFAULT_CENTER}
              defaultZoom={DEFAULT_ZOOM}
              gestureHandling="greedy"
              disableDefaultUI={false}
              style={{ width: "100%", height: "100%" }}
            >
              <TownBubbles clusters={townClusters} />
            </GoogleMap>
          </APIProvider>
        )}
      </div>
    </div>
  );
}
