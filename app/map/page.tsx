"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type AnyRow = Record<string, any>;

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
};

function cleanText(value: any, fallback = "") {
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

function createIdFromName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, "-");
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

export default function MapPage() {
  const [accounts, setAccounts] = useState<AccountLocation[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [searchText, setSearchText] = useState("");
  const [managerFilter, setManagerFilter] = useState("All Managers");
  const [subFilter, setSubFilter] = useState("All Subs");
  const [currentLocation, setCurrentLocation] = useState("");
  const [locationMessage, setLocationMessage] = useState("");

  useEffect(() => {
    async function loadAccounts() {
      try {
        setIsLoading(true);
        setErrorMessage("");

        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || "Could not load accounts.");
        }

        const rawAccounts = result.accounts || result.data || result.rows || [];

        const mappedAccounts: AccountLocation[] = rawAccounts
          .map(mapAccount)
          .filter((account: AccountLocation) => {
            return account.name !== "Unnamed Account" && account.fullAddress;
          });

        const uniqueAccounts = Array.from(
          new Map(
            mappedAccounts.map((account) => [
              `${account.name.toLowerCase()}-${account.fullAddress.toLowerCase()}`,
              account,
            ])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));

        setAccounts(uniqueAccounts);

        if (uniqueAccounts.length > 0) {
          setSelectedAccountId(uniqueAccounts[0].id);
        }
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

  const filteredAccounts = useMemo(() => {
    const search = searchText.toLowerCase().trim();

    return accounts
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
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [accounts, searchText, managerFilter, subFilter]);

  const selectedAccount = useMemo(() => {
    const selectedFromId = filteredAccounts.find(
      (account) => account.id === selectedAccountId
    );

    if (selectedFromId) return selectedFromId;

    return filteredAccounts[0] || null;
  }, [filteredAccounts, selectedAccountId]);

  const mapUrl = selectedAccount
    ? buildGoogleMapsEmbedUrl(selectedAccount.fullAddress)
    : "";

  const directionsUrl = selectedAccount
    ? buildDirectionsUrl(selectedAccount.fullAddress, currentLocation)
    : "";

  const googleMapsUrl = selectedAccount
    ? buildGoogleMapsSearchUrl(selectedAccount.fullAddress)
    : "";

  function clearFilters() {
    setSearchText("");
    setManagerFilter("All Managers");
    setSubFilter("All Subs");

    if (accounts.length > 0) {
      setSelectedAccountId(accounts[0].id);
    }
  }

  function useMyLocation() {
    setLocationMessage("");

    if (!navigator.geolocation) {
      setLocationMessage("Your browser does not support location access.");
      return;
    }

    setLocationMessage("Getting your current location...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = `${position.coords.latitude},${position.coords.longitude}`;
        setCurrentLocation(location);
        setLocationMessage("Current location ready for directions.");
      },
      () => {
        setLocationMessage(
          "Could not get your location. Directions will still open, but Google Maps may ask for the starting point."
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 text-gray-900">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Account Map</h1>
            <p className="mt-2 text-gray-600">
              Search accounts, view the address on Google Maps, and get driving directions.
            </p>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={useMyLocation}
              className="rounded-xl bg-blue-700 px-5 py-3 text-center font-bold text-white shadow-sm hover:bg-blue-800"
            >
              Use My Current Location
            </button>

            <Link
              href="/accounts"
              className="rounded-xl border border-gray-300 bg-white px-5 py-3 text-center font-bold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Back to Accounts
            </Link>
          </div>
        </div>

        {locationMessage ? (
          <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-800">
            {locationMessage}
          </section>
        ) : null}

        {errorMessage ? (
          <section className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">
            {errorMessage}
          </section>
        ) : null}

        <section className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <input
              type="text"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search account, address, manager, or sub..."
              className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 xl:col-span-2"
            />

            <select
              value={managerFilter}
              onChange={(event) => setManagerFilter(event.target.value)}
              className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
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
              className="rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
            >
              {subOptions.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={clearFilters}
              className="rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-800 shadow-sm hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-bold text-gray-700">
                Select Account
              </label>

              <select
                value={selectedAccount?.id || ""}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100"
              >
                {filteredAccounts.map((account) => (
                  <option key={`${account.id}-${account.fullAddress}`} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
                {isLoading
                  ? "Loading accounts with addresses..."
                  : `${filteredAccounts.length} account${
                      filteredAccounts.length === 1 ? "" : "s"
                    } found`}
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            {isLoading ? (
              <div className="flex h-[650px] items-center justify-center text-gray-600">
                Loading map...
              </div>
            ) : selectedAccount && mapUrl ? (
              <iframe
                title="Account Google Map"
                src={mapUrl}
                className="h-[650px] w-full border-0"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div className="flex h-[650px] items-center justify-center text-center text-gray-600">
                No account address found. Check that your Accounts sheet has address columns.
              </div>
            )}
          </div>

          <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-bold">Selected Account</h2>

            {selectedAccount ? (
              <>
                <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <Link
                    href={`/accounts/${encodeURIComponent(selectedAccount.id)}`}
                    className="text-lg font-bold text-blue-700 hover:underline"
                  >
                    {selectedAccount.name}
                  </Link>

                  <p className="mt-3 text-sm text-gray-700">
                    {selectedAccount.fullAddress}
                  </p>
                </div>

                <div className="mt-4 grid gap-2 text-sm text-gray-700">
                  <p>
                    <strong>Status:</strong> {selectedAccount.status}
                  </p>
                  <p>
                    <strong>Manager:</strong> {selectedAccount.manager}
                  </p>
                  <p>
                    <strong>Sub:</strong> {selectedAccount.subcontractor}
                  </p>
                </div>

                <div className="mt-5 grid gap-3">
                  <a
                    href={directionsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl bg-blue-700 px-4 py-3 text-center font-bold text-white hover:bg-blue-800"
                  >
                    Get Directions
                  </a>

                  <a
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-center font-bold text-gray-800 hover:bg-gray-50"
                  >
                    Open in Google Maps
                  </a>

                  <Link
                    href={`/accounts/${encodeURIComponent(selectedAccount.id)}`}
                    className="rounded-xl border border-gray-300 bg-white px-4 py-3 text-center font-bold text-gray-800 hover:bg-gray-50"
                  >
                    Open Account Detail
                  </Link>
                </div>

                <p className="mt-5 text-xs leading-5 text-gray-500">
                  This map page only reads account address information. It does not save or edit anything.
                </p>
              </>
            ) : (
              <p className="mt-4 text-gray-600">
                No account selected.
              </p>
            )}
          </aside>
        </section>
      </div>
    </main>
  );
}