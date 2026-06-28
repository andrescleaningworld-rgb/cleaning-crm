"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import type { DivIcon } from "leaflet";

const MapContainer = dynamic(
  () => import("react-leaflet").then((module) => module.MapContainer),
  { ssr: false }
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((module) => module.TileLayer),
  { ssr: false }
);

const Marker = dynamic(
  () => import("react-leaflet").then((module) => module.Marker),
  { ssr: false }
);

const Popup = dynamic(
  () => import("react-leaflet").then((module) => module.Popup),
  { ssr: false }
);

const INITIAL_PIN_LIMIT = 25;
const PIN_BATCH_SIZE = 50;
const SELECT_OPTION_LIMIT = 250;
const NEARBY_MILES = 100; // Load all pins within this radius when user location is available
const GEOCACHE_KEY = "cw-geocache-v1"; // localStorage key for persisted geocode results

type AnyRow = Record<string, unknown>;

type AccountLocation = {
  id: string;
  name: string;
  manager: string;
  subcontractor: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  fullAddress: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
};

type AccountWithDistance = AccountLocation & {
  distance: number | null;
};

type AccountsApiResponse = {
  success?: boolean;
  error?: string;
  accounts?: AnyRow[];
  data?: AnyRow[];
  rows?: AnyRow[];
};

type CurrentCoords = {
  latitude: number;
  longitude: number;
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

    if (
      found &&
      found.value !== undefined &&
      found.value !== null &&
      found.value !== ""
    ) {
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

function getLoadedAccounts(data: AccountsApiResponse | AnyRow[]) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.accounts)) return data.accounts;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.rows)) return data.rows;
  return [];
}

function mapAccount(row: AnyRow): AccountLocation {
  const name = cleanText(
    getValue(row, [
      "Account Name",
      "accountName",
      "Account",
      "account",
      "Customer",
      "customer",
      "Name",
      "name",
    ]),
    "Unnamed Account"
  );

  const id = cleanText(
    getValue(row, ["ID", "id", "Account ID", "accountId", "account_id"]),
    createIdFromName(name)
  );

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

  const zip = cleanText(
    getValue(row, ["Zip", "zip", "ZIP", "Zip Code", "zipCode", "Postal Code"])
  );

  const fullAddress =
    cleanText(
      getValue(row, [
        "Full Address",
        "fullAddress",
        "Complete Address",
        "completeAddress",
        "Google Address",
        "googleAddress",
      ])
    ) || [address, city, state, zip].filter(Boolean).join(", ");

  const latitude = parseNumber(
    getValue(row, [
      "Latitude",
      "latitude",
      "Lat",
      "lat",
      "Google Latitude",
      "googleLatitude",
    ])
  );

  const longitude = parseNumber(
    getValue(row, [
      "Longitude",
      "longitude",
      "Lng",
      "lng",
      "Long",
      "long",
      "Google Longitude",
      "googleLongitude",
    ])
  );

  return {
    id,
    name,
    manager: cleanText(
      getValue(row, [
        "Manager",
        "manager",
        "Account Manager",
        "accountManager",
        "Assigned Manager",
        "assignedManager",
      ]),
      "Unassigned"
    ),
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
    address,
    city,
    state,
    zip,
    fullAddress,
    status: cleanText(
      getValue(row, ["Status", "status", "Account Status", "accountStatus"]),
      "N/A"
    ),
    latitude,
    longitude,
  };
}

function buildGoogleMapsSearchUrl(destination: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    destination
  )}`;
}

function buildDirectionsUrl(destination: string, currentLocation: string) {
  if (currentLocation) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(
      currentLocation
    )}&destination=${encodeURIComponent(destination)}&travelmode=driving`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    destination
  )}&travelmode=driving`;
}

function distanceInMiles(
  from: CurrentCoords | null,
  account: AccountLocation
): number | null {
  if (!from || account.latitude === null || account.longitude === null) {
    return null;
  }

  const earthRadiusMiles = 3958.8;
  const fromLat = (from.latitude * Math.PI) / 180;
  const toLat = (account.latitude * Math.PI) / 180;
  const latDifference = ((account.latitude - from.latitude) * Math.PI) / 180;
  const lngDifference = ((account.longitude - from.longitude) * Math.PI) / 180;

  const a =
    Math.sin(latDifference / 2) * Math.sin(latDifference / 2) +
    Math.cos(fromLat) *
      Math.cos(toLat) *
      Math.sin(lngDifference / 2) *
      Math.sin(lngDifference / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

function formatMiles(value: number | null) {
  if (value === null) return "";
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function getMapCenter(
  selectedAccount: AccountWithDistance | null,
  currentCoords: CurrentCoords | null,
  accountsWithPins: AccountWithDistance[]
): [number, number] {
  if (
    selectedAccount &&
    selectedAccount.latitude !== null &&
    selectedAccount.longitude !== null
  ) {
    return [selectedAccount.latitude, selectedAccount.longitude];
  }

  if (currentCoords) {
    return [currentCoords.latitude, currentCoords.longitude];
  }

  const firstAccountWithPin = accountsWithPins[0];

  if (
    firstAccountWithPin &&
    firstAccountWithPin.latitude !== null &&
    firstAccountWithPin.longitude !== null
  ) {
    return [firstAccountWithPin.latitude, firstAccountWithPin.longitude];
  }

  return [40.8584, -74.1638];
}

export default function MapPage() {
  const [accounts, setAccounts] = useState<AccountLocation[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchText, setSearchText] = useState("");
  const [managerFilter, setManagerFilter] = useState("All Managers");
  const [subFilter, setSubFilter] = useState("All Subs");
  const [pinLimit, setPinLimit] = useState(INITIAL_PIN_LIMIT);

  const [currentLocation, setCurrentLocation] = useState("");
  const [currentCoords, setCurrentCoords] = useState<CurrentCoords | null>(null);
  const [locationMessage, setLocationMessage] = useState(
    "Tap 'Use My Location' to load and sort all pins near you."
  );

  const [accountPinIcon, setAccountPinIcon] = useState<DivIcon | null>(null);
  const [selectedPinIcon, setSelectedPinIcon] = useState<DivIcon | null>(null);
  const [myLocationIcon, setMyLocationIcon] = useState<DivIcon | null>(null);

  // geocodedCoords keyed by fullAddress — filled from localStorage cache + live Nominatim calls
  const [geocodedCoords, setGeocodedCoords] = useState<
    Record<string, { lat: number; lng: number } | null>
  >({});
  const [geocodingProgress, setGeocodingProgress] = useState<{
    total: number;
    done: number;
  } | null>(null);

  useEffect(() => {
    async function loadLeafletIcons() {
      const leaflet = await import("leaflet");

      const accountIcon = leaflet.divIcon({
        className: "",
        html: `
          <div style="
            width: 22px;
            height: 22px;
            background: #2563eb;
            border: 3px solid white;
            border-radius: 9999px;
            box-shadow: 0 3px 10px rgba(15, 23, 42, 0.35);
          "></div>
        `,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -12],
      });

      const selectedIcon = leaflet.divIcon({
        className: "",
        html: `
          <div style="
            width: 30px;
            height: 30px;
            background: #f97316;
            border: 4px solid white;
            border-radius: 9999px;
            box-shadow: 0 4px 14px rgba(15, 23, 42, 0.45);
          "></div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -16],
      });

      const locationIcon = leaflet.divIcon({
        className: "",
        html: `
          <div style="
            width: 20px;
            height: 20px;
            background: #16a34a;
            border: 3px solid white;
            border-radius: 9999px;
            box-shadow: 0 3px 10px rgba(15, 23, 42, 0.35);
          "></div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
        popupAnchor: [0, -12],
      });

      setAccountPinIcon(accountIcon);
      setSelectedPinIcon(selectedIcon);
      setMyLocationIcon(locationIcon);
    }

    loadLeafletIcons();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const existingLink = document.getElementById("leaflet-css");

    if (existingLink) return;

    const link = document.createElement("link");
    link.id = "leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIINfQdX1tYtk0qfd9stS4d/6fduG3wyy0=";
    link.crossOrigin = "";

    document.head.appendChild(link);
  }, []);

  useEffect(() => {
    async function loadAccounts() {
      try {
        setIsLoading(true);
        setErrorMessage("");

       const response = await fetch("/api/accounts?action=getMapAccounts");

        const result = (await response.json()) as AccountsApiResponse | AnyRow[];

        if (
          !response.ok ||
          (!Array.isArray(result) && result.success === false)
        ) {
          throw new Error(
            !Array.isArray(result) && result.error
              ? result.error
              : "Could not load accounts."
          );
        }

        const rawAccounts = getLoadedAccounts(result);

        const mappedAccounts = rawAccounts
          .map(mapAccount)
          .filter((account) => {
            return account.name !== "Unnamed Account" && account.fullAddress;
          });

        const uniqueAccounts = Array.from(
          new Map(
            mappedAccounts.map((account) => [
              `${account.name.toLowerCase()}-${account.fullAddress.toLowerCase()}`,
              account,
            ])
          ).values()
        );

        setAccounts(uniqueAccounts);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Could not load map data."
        );
      } finally {
        setIsLoading(false);
      }
    }

    loadAccounts();
  }, []);

  // Geocode accounts that have an address but no lat/lng.
  // Results are cached in localStorage so subsequent page loads are instant.
  useEffect(() => {
    if (accounts.length === 0) return;

    let cache: Record<string, { lat: number; lng: number } | null> = {};
    try {
      const raw = localStorage.getItem(GEOCACHE_KEY);
      if (raw) cache = JSON.parse(raw) as typeof cache;
    } catch {
      cache = {};
    }

    const noCoords = accounts.filter(
      (a) => a.latitude === null && a.longitude === null && a.fullAddress
    );

    // Apply cached results immediately so pins appear without waiting
    const cachedUpdates: Record<string, { lat: number; lng: number } | null> = {};
    const toFetch: AccountLocation[] = [];

    for (const acc of noCoords) {
      if (acc.fullAddress in cache) {
        cachedUpdates[acc.fullAddress] = cache[acc.fullAddress];
      } else {
        toFetch.push(acc);
      }
    }

    if (Object.keys(cachedUpdates).length > 0) {
      setGeocodedCoords((prev) => ({ ...prev, ...cachedUpdates }));
    }

    if (toFetch.length === 0) return;

    setGeocodingProgress({ total: toFetch.length, done: 0 });

    let cancelled = false;
    let i = 0;

    async function processNext() {
      if (cancelled || i >= toFetch.length) {
        if (!cancelled) setGeocodingProgress(null);
        return;
      }

      const acc = toFetch[i];
      i += 1;

      try {
        const url =
          `https://nominatim.openstreetmap.org/search?q=` +
          `${encodeURIComponent(acc.fullAddress)}&format=json&limit=1&countrycodes=us`;

        const res = await fetch(url, {
          headers: { "User-Agent": "CleaningWorldCRM/1.0 (cleaning-operations-app)" },
        });

        if (res.ok) {
          const data = (await res.json()) as Array<{ lat: string; lon: string }>;
          const coords =
            data.length > 0
              ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
              : null;

          cache[acc.fullAddress] = coords;
          try {
            localStorage.setItem(GEOCACHE_KEY, JSON.stringify(cache));
          } catch {
            // storage full — skip persisting
          }

          if (!cancelled) {
            if (coords) {
              setGeocodedCoords((prev) => ({ ...prev, [acc.fullAddress]: coords }));
            }
            setGeocodingProgress({ total: toFetch.length, done: i });
          }
        }
      } catch {
        // Network error — skip this address; will retry next session
      }

      if (!cancelled) {
        // Nominatim usage policy: max 1 request per second
        setTimeout(processNext, 1100);
      }
    }

    processNext();

    return () => {
      cancelled = true;
    };
  }, [accounts]);

  useEffect(() => {
    setPinLimit(INITIAL_PIN_LIMIT);
  }, [searchText, managerFilter, subFilter]);

  const managerOptions = useMemo(() => {
    const managers = Array.from(
      new Set(accounts.map((account) => account.manager).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    return ["All Managers", ...managers];
  }, [accounts]);

  const subOptions = useMemo(() => {
    const subs = Array.from(
      new Set(accounts.map((account) => account.subcontractor).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    return ["All Subs", ...subs];
  }, [accounts]);

  // Merge geocoded coordinates into accounts that had no lat/lng from the backend
  const accountsWithCoords = useMemo<AccountLocation[]>(() => {
    return accounts.map((acc) => {
      if (acc.latitude !== null && acc.longitude !== null) return acc;
      const geocoded = geocodedCoords[acc.fullAddress];
      if (!geocoded) return acc;
      return { ...acc, latitude: geocoded.lat, longitude: geocoded.lng };
    });
  }, [accounts, geocodedCoords]);

  const accountsWithDistance = useMemo<AccountWithDistance[]>(() => {
    return accountsWithCoords.map((account) => ({
      ...account,
      distance: distanceInMiles(currentCoords, account),
    }));
  }, [accountsWithCoords, currentCoords]);

  const filteredAccounts = useMemo(() => {
    const search = searchText.toLowerCase().trim();

    return accountsWithDistance
      .filter((account) => {
        const matchesSearch = search
          ? account.name.toLowerCase().includes(search) ||
            account.fullAddress.toLowerCase().includes(search) ||
            account.manager.toLowerCase().includes(search) ||
            account.subcontractor.toLowerCase().includes(search)
          : true;

        const matchesManager =
          managerFilter === "All Managers"
            ? true
            : account.manager === managerFilter;

        const matchesSub =
          subFilter === "All Subs" ? true : account.subcontractor === subFilter;

        return matchesSearch && matchesManager && matchesSub;
      })
      .sort((a, b) => {
        if (a.distance !== null && b.distance !== null) {
          return a.distance - b.distance;
        }

        if (a.distance !== null) return -1;
        if (b.distance !== null) return 1;

        return a.name.localeCompare(b.name);
      });
  }, [accountsWithDistance, searchText, managerFilter, subFilter]);

  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) return null;

    return (
      filteredAccounts.find((account) => account.id === selectedAccountId) ||
      accountsWithDistance.find((account) => account.id === selectedAccountId) ||
      null
    );
  }, [filteredAccounts, accountsWithDistance, selectedAccountId]);

  const nearbyAccounts = useMemo(() => {
    return filteredAccounts.slice(0, 25);
  }, [filteredAccounts]);

  const accountsWithPins = useMemo(() => {
    return filteredAccounts.filter((account) => {
      if (account.latitude === null || account.longitude === null) {
        return false;
      }

      // Keep only accounts roughly in NJ / NYC / nearby service area.
      // This prevents bad Google geocodes from throwing the map across the world.
      const isNearbyServiceArea =
        account.latitude >= 38.5 &&
        account.latitude <= 42.5 &&
        account.longitude >= -76.5 &&
        account.longitude <= -72.5;

      if (!isNearbyServiceArea) return false;

      // When user location is known, only include pins near the user
      if (currentCoords && account.distance !== null) {
        return account.distance <= NEARBY_MILES;
      }

      return true;
    });
  }, [filteredAccounts, currentCoords]);

  const visibleAccountsWithPins = useMemo(() => {
    const limitedPins = accountsWithPins.slice(0, pinLimit);

    if (
      selectedAccount &&
      selectedAccount.latitude !== null &&
      selectedAccount.longitude !== null &&
      !limitedPins.some((account) => account.id === selectedAccount.id)
    ) {
      return [selectedAccount, ...limitedPins];
    }

    return limitedPins;
  }, [accountsWithPins, pinLimit, selectedAccount]);

  const selectAccountOptions = useMemo(() => {
    return filteredAccounts.slice(0, SELECT_OPTION_LIMIT);
  }, [filteredAccounts]);

  const mapCenter = getMapCenter(selectedAccount, currentCoords, accountsWithPins);

  // Only remount the map when the user's location is first detected (big center jump).
  // Selecting an account no longer causes a remount — the pin highlights and the
  // info panel updates without resetting tiles, zoom, or scroll position.
  const mapKey = currentCoords
    ? `user-${currentCoords.latitude.toFixed(2)}-${currentCoords.longitude.toFixed(2)}`
    : "static";

  const directionsUrl = selectedAccount
    ? buildDirectionsUrl(selectedAccount.fullAddress, currentLocation)
    : "";

  const googleMapsUrl = selectedAccount
    ? buildGoogleMapsSearchUrl(selectedAccount.fullAddress)
    : currentLocation
      ? buildGoogleMapsSearchUrl(currentLocation)
      : "";

  const accountsMissingPins = filteredAccounts.length - accountsWithPins.length;
  const hiddenPinCount = Math.max(accountsWithPins.length - pinLimit, 0);

  function clearFilters() {
    setSearchText("");
    setManagerFilter("All Managers");
    setSubFilter("All Subs");
    setSelectedAccountId("");
    setPinLimit(INITIAL_PIN_LIMIT);
  }

  function useMyLocationOnLoad() {
    if (typeof window === "undefined") return;

    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support location access.");
      return;
    }

    setLocationMessage("Getting your current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = `${position.coords.latitude},${position.coords.longitude}`;

        setCurrentCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        setCurrentLocation(location);
        setSelectedAccountId("");
        setPinLimit(2000); // Load all nearby pins (within NEARBY_MILES)
        setLocationMessage(
          `Showing all pins within ~${NEARBY_MILES} miles of your location, sorted by distance.`
        );
      },
      () => {
        setLocationMessage(
          "Could not get your location. The map will still show account pins that have latitude/longitude."
        );
      },
      {
        enableHighAccuracy: false,
        timeout: 7000,
        maximumAge: 300000,
      }
    );
  }

  function useMyLocationButton() {
    useMyLocationOnLoad();
  }

  function loadMorePins() {
    setPinLimit((current) => current + PIN_BATCH_SIZE);
  }

  function showAllPins() {
    setPinLimit(accountsWithPins.length);
  }

  // Auto load location on mount so map shows pins near the user by default
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!currentCoords && typeof window !== "undefined") {
        useMyLocationOnLoad();
      }
    }, 800);
    return () => clearTimeout(timer);
  }, []); // run once on mount


  return (
    <main className="min-h-screen bg-gray-50 p-3 text-gray-900 sm:p-5">
      <div className="mx-auto max-w-7xl">
        <header className="mb-3 flex flex-col gap-3 sm:mb-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Cleaning World
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">
              Account Map
            </h1>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
            <button
              type="button"
              onClick={useMyLocationButton}
              className="rounded-xl bg-green-700 px-4 py-3 text-center font-bold text-white shadow-sm hover:bg-green-800 min-h-[48px]"
            >
              Use My Location - load all pins near me
            </button>

            <Link
              href="/accounts"
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-center font-bold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Back to Accounts
            </Link>
          </div>
        </header>

        {errorMessage ? (
          <section className="mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="mb-4 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 bg-white p-3">
            <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
              <input
                type="text"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search account, address, manager, or sub..."
                className="min-h-[48px] rounded-xl border border-gray-300 px-4 py-3 text-base font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              />

              <select
                value={selectedAccount?.id || ""}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                className="min-h-[48px] rounded-xl border border-gray-300 px-4 py-3 text-base font-semibold outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-100 lg:w-[320px]"
              >
                <option value="">Select account</option>

                {selectAccountOptions.map((account) => (
                  <option
                    key={`${account.id}-${account.fullAddress}`}
                    value={account.id}
                  >
                    {account.distance !== null
                      ? `${formatMiles(account.distance)} - ${account.name}`
                      : account.name}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={clearFilters}
                className="min-h-[48px] rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-800 shadow-sm hover:bg-gray-50"
              >
                Clear
              </button>
            </div>

            <div className="mt-2 flex flex-col gap-2 text-xs font-semibold text-gray-600 sm:flex-row sm:items-center sm:justify-between">
              <p>{locationMessage}</p>
              <p>
                {isLoading
                  ? "Loading accounts..."
                  : `${filteredAccounts.length} found / ${accountsWithPins.length} with pins / showing ${visibleAccountsWithPins.length}`}
              </p>
            </div>

            {!isLoading && filteredAccounts.length > SELECT_OPTION_LIMIT ? (
              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800">
                The dropdown is showing the first {SELECT_OPTION_LIMIT} results
                for speed. Use search or filters to find a specific account.
              </div>
            ) : null}

            {!isLoading && geocodingProgress !== null ? (
              <div className="mt-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800">
                Auto-geocoding addresses to add pins: {geocodingProgress.done} / {geocodingProgress.total} done — pins appear as each address resolves. Results are cached so this only runs once per address.
              </div>
            ) : !isLoading && accountsMissingPins > 0 ? (
              <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                {accountsMissingPins} account
                {accountsMissingPins === 1 ? "" : "s"} could not be geocoded and cannot show as pins. Check that addresses are complete (street, city, state).
              </div>
            ) : null}

            {!isLoading && hiddenPinCount > 0 ? (
              <div className="mt-2 flex flex-col gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs font-bold text-gray-700 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing {visibleAccountsWithPins.length} pins first for faster
                  loading. {hiddenPinCount} more pin
                  {hiddenPinCount === 1 ? "" : "s"} available.
                </span>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={loadMorePins}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700"
                  >
                    Load More Pins
                  </button>

                  <button
                    type="button"
                    onClick={showAllPins}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-black text-gray-800 hover:bg-gray-50"
                  >
                    Show All Pins
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="relative">
            {isLoading ? (
              <div className="flex h-[68vh] min-h-[460px] items-center justify-center px-4 text-center text-gray-600">
                Loading account locations for the map...<br />
                <span className="text-xs text-gray-500">(This can take 10-30+ seconds if there are many accounts or the backend is busy)</span>
              </div>
            ) : accountPinIcon && selectedPinIcon && myLocationIcon ? (
              <div className="h-[68vh] min-h-[460px] w-full">
                <MapContainer
                  key={mapKey}
                  center={mapCenter}
                  zoom={11}
                  scrollWheelZoom
                  className="h-full w-full"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />

                  {currentCoords ? (
                    <Marker
                      position={[
                        currentCoords.latitude,
                        currentCoords.longitude,
                      ]}
                      icon={myLocationIcon}
                    >
                      <Popup>
                        <div className="text-sm">
                          <p className="font-black">My Location</p>
                        </div>
                      </Popup>
                    </Marker>
                  ) : null}

                  {visibleAccountsWithPins.map((account) => {
                    const isSelected = selectedAccount?.id === account.id;

                    if (
                      account.latitude === null ||
                      account.longitude === null
                    ) {
                      return null;
                    }

                    return (
                      <Marker
                        key={`${account.id}-${account.fullAddress}`}
                        position={[account.latitude, account.longitude]}
                        icon={isSelected ? selectedPinIcon : accountPinIcon}
                        eventHandlers={{
                          click: () => setSelectedAccountId(account.id),
                        }}
                      >
                        <Popup>
                          <div className="max-w-[240px] text-sm">
                            <Link
                              href={`/accounts/${encodeURIComponent(account.id)}`}
                              className="font-black text-blue-800 hover:underline"
                            >
                              {account.name}
                            </Link>

                            <a
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.fullAddress)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 block text-gray-700 hover:text-blue-600 hover:underline"
                            >
                              {account.fullAddress}
                            </a>

                            {account.distance !== null ? (
                              <p className="mt-1 font-bold text-blue-700">
                                {formatMiles(account.distance)}
                              </p>
                            ) : null}

                            <div className="mt-2 flex flex-wrap gap-2">
                              <a
                                href={buildDirectionsUrl(
                                  account.fullAddress,
                                  currentLocation
                                )}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg bg-orange-600 px-3 py-1 text-xs font-bold text-white"
                              >
                                Directions
                              </a>

                              <Link
                                href={`/accounts/${encodeURIComponent(
                                  account.id
                                )}`}
                                className="rounded-lg border border-gray-300 px-3 py-1 text-xs font-bold text-gray-800"
                              >
                                Account
                              </Link>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>
              </div>
            ) : (
              <div className="flex h-[68vh] min-h-[460px] items-center justify-center px-5 text-center text-gray-600">
                Loading map pins... (rendering limited number for performance)
              </div>
            )}

            {selectedAccount ? (
              <div className="absolute bottom-3 left-3 right-3 z-[500] rounded-2xl border border-orange-200 bg-white/95 p-4 shadow-lg backdrop-blur md:left-auto md:w-[390px]">
                <div className="mb-2 inline-flex rounded-full bg-orange-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  Selected Account
                </div>

                <Link
                  href={`/accounts/${encodeURIComponent(selectedAccount.id)}`}
                  className="block text-lg font-black text-orange-800 hover:underline"
                >
                  {selectedAccount.name}
                </Link>

                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedAccount.fullAddress)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 block text-sm font-semibold text-gray-700 hover:text-blue-600 hover:underline"
                >
                  {selectedAccount.fullAddress}
                </a>

                {selectedAccount.distance !== null ? (
                  <p className="mt-2 text-sm font-black text-blue-700">
                    {formatMiles(selectedAccount.distance)}
                  </p>
                ) : null}

                {selectedAccount.latitude === null ||
                selectedAccount.longitude === null ? (
                  <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs font-bold text-amber-800">
                    This account has no latitude/longitude yet, so it cannot
                    show as a pin.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-bold text-white hover:bg-orange-700"
                  >
                    Directions
                  </a>

                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
                  >
                    Google Maps
                  </a>

                  <Link
                    href={`/accounts/${encodeURIComponent(selectedAccount.id)}`}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
                  >
                    Account
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="mb-4 grid gap-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-sm md:grid-cols-3">
          <select
            value={managerFilter}
            onChange={(event) => setManagerFilter(event.target.value)}
            className="min-h-[48px] rounded-xl border border-gray-300 px-4 py-3 text-base font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          >
            {managerOptions.map((manager) => (
              <option key={manager} value={manager}>
                {manager}
              </option>
            ))}
          </select>

          <select
            value={subFilter}
            onChange={(event) => setSubFilter(event.target.value)}
            className="min-h-[48px] rounded-xl border border-gray-300 px-4 py-3 text-base font-semibold outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
          >
            {subOptions.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-bold text-gray-700">
            Blue pins are accounts. Orange pin is selected. Green pin is your
            location.
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Nearby Accounts</h2>
              <p className="text-sm text-gray-500">
                Tap an account to move the map, highlight the pin, and open
                directions.
              </p>
            </div>

            <span className="font-bold text-gray-500">
              Showing {nearbyAccounts.length}
            </span>
          </div>

          {nearbyAccounts.length === 0 ? (
            <p className="text-gray-500">No accounts found.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {nearbyAccounts.map((account) => {
                const isSelected = selectedAccount?.id === account.id;
                const hasPin =
                  account.latitude !== null && account.longitude !== null;

                return (
                  <button
                    key={`${account.id}-${account.fullAddress}`}
                    type="button"
                    onClick={() => setSelectedAccountId(account.id)}
                    className={`rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                      isSelected
                        ? "border-orange-300 bg-orange-50"
                        : "border-gray-200 bg-white"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h3
                          className={`font-black ${
                            isSelected ? "text-orange-800" : "text-gray-900"
                          }`}
                        >
                          {account.name}
                        </h3>

                        <span
                          role="link"
                          tabIndex={0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.fullAddress)}`, "_blank", "noopener,noreferrer");
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(account.fullAddress)}`, "_blank", "noopener,noreferrer");
                            }
                          }}
                          className="mt-2 block text-sm leading-5 text-gray-600 hover:text-blue-600 hover:underline cursor-pointer"
                        >
                          {account.fullAddress}
                        </span>
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-2">
                        {account.distance !== null ? (
                          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                            {formatMiles(account.distance)}
                          </span>
                        ) : null}

                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${
                            hasPin
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {hasPin ? "Pin" : "No Pin"}
                        </span>
                      </div>
                    </div>

                    <div className="mt-3 grid gap-1 text-xs font-semibold text-gray-500">
                      <p>Manager: {account.manager}</p>
                      <p>Sub: {account.subcontractor}</p>
                      <p>Status: {account.status}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}