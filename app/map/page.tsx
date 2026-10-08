"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import "leaflet/dist/leaflet.css";
import type { DivIcon } from "leaflet";
import { distanceInMiles, formatMiles } from "../lib/distance";
import { BigButton, Card, EmptyState, ErrorBox, Screen, SearchBar, SelectField, Sheet, StatusPill } from "@/app/ui";

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
const GEOCODE_BATCH_SIZE = 25; // addresses per /api/geocode/batch call

// Roughly NJ / NYC / nearby service area. Accounts with coordinates outside this
// box are almost always bad geocodes (ambiguous address, wrong country, etc.)
// rather than real out-of-territory accounts.
const SERVICE_AREA_LAT_MIN = 38.5;
const SERVICE_AREA_LAT_MAX = 42.5;
const SERVICE_AREA_LNG_MIN = -76.5;
const SERVICE_AREA_LNG_MAX = -72.5;

function isInServiceArea(latitude: number, longitude: number) {
  return (
    latitude >= SERVICE_AREA_LAT_MIN &&
    latitude <= SERVICE_AREA_LAT_MAX &&
    longitude >= SERVICE_AREA_LNG_MIN &&
    longitude <= SERVICE_AREA_LNG_MAX
  );
}

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
  // Layout only: the manager and sub filters open in a sheet.
  const [showFilters, setShowFilters] = useState(false);

  const [currentLocation, setCurrentLocation] = useState("");
  const [currentCoords, setCurrentCoords] = useState<CurrentCoords | null>(null);
  const [locationMessage, setLocationMessage] = useState(
    "Tap 'Use My Location' to load and sort all pins near you."
  );

  const [accountPinIcon, setAccountPinIcon] = useState<DivIcon | null>(null);
  const [selectedPinIcon, setSelectedPinIcon] = useState<DivIcon | null>(null);
  const [myLocationIcon, setMyLocationIcon] = useState<DivIcon | null>(null);

  // geocodedCoords keyed by fullAddress — filled from the shared server-side geocode cache
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

  // Geocode accounts that have an address but no lat/lng, via the shared
  // server-side geocode cache (/api/geocode/batch) backed by the GeocodeCache
  // sheet — results are shared across all users/sessions, not just this browser.
  useEffect(() => {
    if (accounts.length === 0) return;

    const toFetch = Array.from(
      new Set(
        accounts
          .filter((a) => a.latitude === null && a.longitude === null && a.fullAddress)
          .map((a) => a.fullAddress)
      )
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
                  next[r.address] =
                    r.latitude !== null && r.longitude !== null
                      ? { lat: r.latitude, lng: r.longitude }
                      : null;
                }
                return next;
              });
            }
          }
        } catch {
          // Network error — skip this chunk; will retry next page load
        }

        if (!cancelled) {
          setGeocodingProgress({
            total: toFetch.length,
            done: Math.min(i + GEOCODE_BATCH_SIZE, toFetch.length),
          });
        }
      }

      if (!cancelled) setGeocodingProgress(null);
    }

    runBatches();

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

      if (!isInServiceArea(account.latitude, account.longitude)) {
        return false;
      }

      // When user location is known, only include pins near the user
      if (currentCoords && account.distance !== null) {
        return account.distance <= NEARBY_MILES;
      }

      return true;
    });
  }, [filteredAccounts, currentCoords]);

  // Accounts that were geocoded but landed outside the service area box above —
  // surfaced separately so staff can see and fix them instead of the account
  // just silently having no pin.
  const outOfServiceAreaAccounts = useMemo(() => {
    return filteredAccounts.filter((account) => {
      if (account.latitude === null || account.longitude === null) return false;
      return !isInServiceArea(account.latitude, account.longitude);
    });
  }, [filteredAccounts]);

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

  // Only counts accounts with no coordinates at all — accounts with bad/out-of-area
  // coordinates are geocoded, just wrong, so they're surfaced separately below
  // instead of being folded into this "could not be geocoded" count.
  const accountsMissingPins = filteredAccounts.filter(
    (account) => account.latitude === null || account.longitude === null
  ).length;
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


  const filtersOn = (managerFilter !== "All Managers" ? 1 : 0) + (subFilter !== "All Subs" ? 1 : 0);
  const mapBoxStyle = { height: "68vh", minHeight: 460, width: "100%", borderRadius: 16, overflow: "hidden", border: "2px solid var(--ui-line)" } as const;
  const mapsSearchUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <Screen
      title="Account Map"
      subtitle="Blue pins are accounts. Orange pin is selected. Green pin is your location."
      backHref="/accounts"
      action={<BigButton onClick={useMyLocationButton}>Use my location (load all pins near me)</BigButton>}
    >
      {errorMessage ? <ErrorBox title="The map did not load." text={errorMessage} /> : null}

      <SearchBar value={searchText} onChange={setSearchText} label="Search the map" placeholder="Search account, address, manager, or sub" />

      <SelectField
        label="Select account"
        hint={
          !isLoading && filteredAccounts.length > SELECT_OPTION_LIMIT
            ? `This list shows the first ${SELECT_OPTION_LIMIT} results for speed. Use search or filters to find a specific account.`
            : undefined
        }
        value={selectedAccount?.id || ""}
        onChange={(event) => setSelectedAccountId(event.target.value)}
      >
        <option value="">Select account</option>
        {selectAccountOptions.map((account) => (
          <option key={`${account.id}-${account.fullAddress}`} value={account.id}>
            {account.distance !== null ? `${formatMiles(account.distance)} - ${account.name}` : account.name}
          </option>
        ))}
      </SelectField>

      <div className="ui-actions-row">
        <BigButton kind="second" onClick={() => setShowFilters(true)}>
          {filtersOn ? `Filter (${filtersOn} on)` : "Filter"}
        </BigButton>
        <BigButton kind="quiet" onClick={clearFilters}>
          Clear
        </BigButton>
      </div>

      <div role="status">
        <p className="ui-muted">{locationMessage}</p>
        <p className="ui-muted">
          {isLoading
            ? "Loading accounts…"
            : `${filteredAccounts.length} found / ${accountsWithPins.length} with pins / showing ${visibleAccountsWithPins.length}`}
        </p>
        {!isLoading && geocodingProgress !== null ? (
          <p className="ui-muted">
            Finding addresses to add pins: {geocodingProgress.done} / {geocodingProgress.total} done. Pins appear as each address is found. This
            only runs once per address.
          </p>
        ) : !isLoading && accountsMissingPins > 0 ? (
          <p className="ui-field-error">
            {accountsMissingPins} account{accountsMissingPins === 1 ? "" : "s"} could not be found on the map and cannot show as pins. Check
            that addresses are complete (street, city, state).
          </p>
        ) : null}
      </div>

      {!isLoading && outOfServiceAreaAccounts.length > 0 ? (
        <details className="ui-card">
          <summary className="ui-strong" style={{ cursor: "pointer", minHeight: 48 }}>
            {outOfServiceAreaAccounts.length} account{outOfServiceAreaAccounts.length === 1 ? "" : "s"} have a location outside the expected NJ
            / NYC service area and are hidden from the map. Their address likely needs correcting. Tap to view.
          </summary>
          <ul className="ui-list-plain" style={{ marginTop: 8, gap: 4 }}>
            {outOfServiceAreaAccounts.map((account) => (
              <li key={account.id}>
                {account.name}
                {account.address ? ` — ${account.address}` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {!isLoading && hiddenPinCount > 0 ? (
        <Card>
          <p className="ui-card-text">
            Showing {visibleAccountsWithPins.length} pins first for faster loading. {hiddenPinCount} more pin{hiddenPinCount === 1 ? "" : "s"}{" "}
            available.
          </p>
          <div className="ui-actions-row" style={{ marginTop: 12 }}>
            <BigButton kind="second" onClick={loadMorePins}>
              Load more pins
            </BigButton>
            <BigButton kind="quiet" onClick={showAllPins}>
              Show all pins
            </BigButton>
          </div>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="ui-skeleton" style={{ ...mapBoxStyle, border: 0 }} role="status" aria-label="Loading account locations for the map. This can take 10 to 30 seconds." />
      ) : accountPinIcon && selectedPinIcon && myLocationIcon ? (
        <div style={mapBoxStyle}>
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
        <div className="ui-skeleton" style={{ ...mapBoxStyle, border: 0 }} role="status" aria-label="Loading map pins" />
      )}

      {selectedAccount ? (
        <Card title={selectedAccount.name} right={<StatusPill kind="waiting">Selected</StatusPill>}>
          <a href={mapsSearchUrl(selectedAccount.fullAddress)} target="_blank" rel="noopener noreferrer" className="ui-link">
            {selectedAccount.fullAddress}
          </a>
          {selectedAccount.distance !== null ? <p className="ui-strong">{formatMiles(selectedAccount.distance)}</p> : null}
          {selectedAccount.latitude === null || selectedAccount.longitude === null ? (
            <p className="ui-field-error">This account has no map location yet, so it cannot show as a pin.</p>
          ) : null}
          <div className="ui-actions-row" style={{ marginTop: 12 }}>
            <a href={directionsUrl} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-second">
              Directions
            </a>
            <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="ui-btn ui-btn-second">
              Google Maps
            </a>
            <BigButton kind="second" href={`/accounts/${encodeURIComponent(selectedAccount.id)}`}>
              Go to account
            </BigButton>
          </div>
        </Card>
      ) : null}

      <div>
        <p className="ui-strong">Nearby Accounts</p>
        <p className="ui-muted">
          Tap Show on map to move the map and highlight the pin. Showing {nearbyAccounts.length}.
        </p>
      </div>

      {nearbyAccounts.length === 0 ? (
        isLoading ? null : (
          <EmptyState icon="search" title="No accounts found" text="Try a shorter search, or clear the filters." />
        )
      ) : (
        <div className="ui-three">
          {nearbyAccounts.map((account) => {
            const isSelected = selectedAccount?.id === account.id;
            const hasPin = account.latitude !== null && account.longitude !== null;

            return (
              <Card
                key={`${account.id}-${account.fullAddress}`}
                title={account.name}
                right={isSelected ? <StatusPill kind="waiting">Selected</StatusPill> : undefined}
              >
                <a href={mapsSearchUrl(account.fullAddress)} target="_blank" rel="noopener noreferrer" className="ui-link">
                  {account.fullAddress}
                </a>
                <div className="ui-actions-row" style={{ marginTop: 8 }}>
                  {account.distance !== null ? <StatusPill kind="off">{formatMiles(account.distance)}</StatusPill> : null}
                  <StatusPill kind={hasPin ? "done" : "waiting"}>{hasPin ? "Pin" : "No Pin"}</StatusPill>
                </div>
                <p className="ui-card-text">Manager: {account.manager}</p>
                <p className="ui-card-text">Sub: {account.subcontractor}</p>
                <p className="ui-card-text">Status: {account.status}</p>
                <div style={{ marginTop: 12 }}>
                  <BigButton kind="second" onClick={() => setSelectedAccountId(account.id)} aria-label={`Show ${account.name} on the map`}>
                    Show on map
                  </BigButton>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={showFilters} title="Filter" onClose={() => setShowFilters(false)} closeLabel="Done">
        <SelectField label="Manager" value={managerFilter} onChange={(event) => setManagerFilter(event.target.value)}>
          {managerOptions.map((manager) => (
            <option key={manager} value={manager}>
              {manager}
            </option>
          ))}
        </SelectField>
        <SelectField label="Subcontractor" value={subFilter} onChange={(event) => setSubFilter(event.target.value)}>
          {subOptions.map((sub) => (
            <option key={sub} value={sub}>
              {sub}
            </option>
          ))}
        </SelectField>
      </Sheet>
    </Screen>
  );
}
