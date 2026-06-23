"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

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

function buildGoogleMapsEmbedUrl(destination: string) {
  return `https://www.google.com/maps?q=${encodeURIComponent(
    destination
  )}&output=embed`;
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

export default function MapPage() {
  const [accounts, setAccounts] = useState<AccountLocation[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchText, setSearchText] = useState("");
  const [managerFilter, setManagerFilter] = useState("All Managers");
  const [subFilter, setSubFilter] = useState("All Subs");

  const [currentLocation, setCurrentLocation] = useState("");
  const [currentCoords, setCurrentCoords] = useState<CurrentCoords | null>(null);
  const [locationMessage, setLocationMessage] = useState(
    "Allow location access to see nearby accounts first."
  );

  useEffect(() => {
    async function loadAccounts() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

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

  useEffect(() => {
    useMyLocationOnLoad();
  }, []);

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

  const accountsWithDistance = useMemo(() => {
    return accounts.map((account) => ({
      ...account,
      distance: distanceInMiles(currentCoords, account),
    }));
  }, [accounts, currentCoords]);

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

  const mapDestination = selectedAccount
    ? selectedAccount.fullAddress
    : currentLocation;

  const mapUrl = mapDestination ? buildGoogleMapsEmbedUrl(mapDestination) : "";

  const directionsUrl = selectedAccount
    ? buildDirectionsUrl(selectedAccount.fullAddress, currentLocation)
    : "";

  const googleMapsUrl = selectedAccount
    ? buildGoogleMapsSearchUrl(selectedAccount.fullAddress)
    : currentLocation
      ? buildGoogleMapsSearchUrl(currentLocation)
      : "";

  function clearFilters() {
    setSearchText("");
    setManagerFilter("All Managers");
    setSubFilter("All Subs");
    setSelectedAccountId("");
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
        setLocationMessage(
          "Showing accounts closest to your current location when latitude/longitude are available."
        );
      },
      () => {
        setLocationMessage(
          "Could not get your location. Select an account to view it on the map."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  function useMyLocationButton() {
    useMyLocationOnLoad();
  }

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
              className="rounded-xl bg-green-700 px-4 py-3 text-center font-bold text-white shadow-sm hover:bg-green-800"
            >
              Use My Location
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
                <option value="">Map starts at my location</option>

                {filteredAccounts.map((account) => (
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
                  : `${filteredAccounts.length} account${
                      filteredAccounts.length === 1 ? "" : "s"
                    } found`}
              </p>
            </div>
          </div>

          <div className="relative">
            {isLoading ? (
              <div className="flex h-[68vh] min-h-[460px] items-center justify-center text-gray-600">
                Loading map...
              </div>
            ) : mapUrl ? (
              <iframe
                title="Cleaning World Account Map"
                src={mapUrl}
                className="h-[68vh] min-h-[460px] w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex h-[68vh] min-h-[460px] items-center justify-center px-5 text-center text-gray-600">
                Location is not available yet. Allow location access or select
                an account.
              </div>
            )}

            {selectedAccount ? (
              <div className="absolute bottom-3 left-3 right-3 rounded-2xl border border-orange-200 bg-white/95 p-4 shadow-lg backdrop-blur md:left-auto md:w-[390px]">
                <div className="mb-2 inline-flex rounded-full bg-orange-600 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                  Selected Account
                </div>

                <Link
                  href={`/accounts/${encodeURIComponent(selectedAccount.id)}`}
                  className="block text-lg font-black text-orange-800 hover:underline"
                >
                  {selectedAccount.name}
                </Link>

                <p className="mt-2 text-sm font-semibold text-gray-700">
                  {selectedAccount.fullAddress}
                </p>

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
            Nearby list sorts by distance when Lat/Lng exist.
          </div>
        </section>

        <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-black">Nearby Accounts</h2>
              <p className="text-sm text-gray-500">
                Tap an account to move the map and open directions.
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

                        <p className="mt-2 text-sm leading-5 text-gray-600">
                          {account.fullAddress}
                        </p>
                      </div>

                      {account.distance !== null ? (
                        <span className="shrink-0 rounded-full bg-blue-100 px-3 py-1 text-xs font-black text-blue-700">
                          {formatMiles(account.distance)}
                        </span>
                      ) : null}
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