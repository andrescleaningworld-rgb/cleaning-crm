"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type AccountRecord = Record<string, unknown>;

type Account = {
  id: string;
  name: string;
  address: string;
  cityStateZip: string;
  status: string;
  manager: string;
  subcontractor: string;
  latitude: number | null;
  longitude: number | null;
};

type UserLocation = {
  latitude: number;
  longitude: number;
};

function getText(row: AccountRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return "";
}

function getNumber(row: AccountRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string") {
      const cleaned = value.trim();

      if (!cleaned) continue;

      const parsed = Number(cleaned);

      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function normalizeAccounts(data: unknown): Account[] {
  let rows: AccountRecord[] = [];

  if (Array.isArray(data)) {
    rows = data as AccountRecord[];
  } else if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;

    if (Array.isArray(obj.accounts)) {
      rows = obj.accounts as AccountRecord[];
    } else if (Array.isArray(obj.data)) {
      rows = obj.data as AccountRecord[];
    } else if (Array.isArray(obj.rows)) {
      rows = obj.rows as AccountRecord[];
    }
  }

  return rows
    .map((row, index) => {
      const id =
        getText(row, [
          "Account ID",
          "Account Id",
          "ID",
          "Id",
          "id",
          "accountId",
        ]) || String(index);

      const name =
        getText(row, [
          "Account Name",
          "Account",
          "Name",
          "accountName",
          "name",
        ]) || "Unnamed Account";

      const address = getText(row, [
        "Address",
        "Service Address",
        "Account Address",
        "address",
      ]);

      const city = getText(row, ["City", "city"]);
      const state = getText(row, ["State", "state"]);
      const zip = getText(row, ["Zip", "ZIP", "Zip Code", "zip"]);

      const cityStateZip = [city, state, zip].filter(Boolean).join(", ");

      const status =
        getText(row, ["Status", "status", "Account Status"]) || "Active";

      const manager = getText(row, [
        "Manager",
        "Account Manager",
        "manager",
        "accountManager",
      ]);

      const subcontractor = getText(row, [
        "Subcontractor",
        "Sub",
        "Sub Assigned",
        "Assigned Sub",
        "subcontractor",
        "sub",
      ]);

      const latitude = getNumber(row, [
        "Latitude",
        "Lat",
        "latitude",
        "lat",
      ]);

      const longitude = getNumber(row, [
        "Longitude",
        "Lng",
        "Long",
        "longitude",
        "lng",
        "long",
      ]);

      return {
        id,
        name,
        address,
        cityStateZip,
        status,
        manager,
        subcontractor,
        latitude,
        longitude,
      };
    })
    .filter((account) => account.name && account.address);
}

function hasCoordinates(account: Account) {
  return (
    typeof account.latitude === "number" &&
    Number.isFinite(account.latitude) &&
    typeof account.longitude === "number" &&
    Number.isFinite(account.longitude)
  );
}

function buildFullAddress(account: Account) {
  return [account.address, account.cityStateZip].filter(Boolean).join(", ");
}

function buildGoogleMapsUrl(account: Account) {
  const query = encodeURIComponent(buildFullAddress(account));
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

function buildDirectionsUrl(account: Account, userLocation: UserLocation | null) {
  const destination = encodeURIComponent(buildFullAddress(account));

  if (userLocation) {
    const origin = encodeURIComponent(
      `${userLocation.latitude},${userLocation.longitude}`
    );

    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
  }

  return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
}

function haversineMiles(
  userLocation: UserLocation,
  accountLatitude: number,
  accountLongitude: number
) {
  const earthRadiusMiles = 3958.8;

  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

  const lat1 = toRadians(userLocation.latitude);
  const lat2 = toRadians(accountLatitude);
  const deltaLat = toRadians(accountLatitude - userLocation.latitude);
  const deltaLng = toRadians(accountLongitude - userLocation.longitude);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMiles * c;
}

export default function AccountMapPage() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<unknown>(null);
  const markersLayerRef = useRef<unknown>(null);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [search, setSearch] = useState("");
  const [managerFilter, setManagerFilter] = useState("All Managers");
  const [subFilter, setSubFilter] = useState("All Subs");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [locationError, setLocationError] = useState("");
  const [usingLocation, setUsingLocation] = useState(false);

  useEffect(() => {
    async function loadAccounts() {
      try {
        setLoading(true);
        setLoadError("");

        const response = await fetch("/api/accounts", {
          cache: "no-store",
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Unable to load accounts.");
        }

        const normalized = normalizeAccounts(data);
        setAccounts(normalized);

        const firstWithCoordinates = normalized.find(hasCoordinates);
        const firstAccount = firstWithCoordinates || normalized[0];

        if (firstAccount) {
          setSelectedAccountId(firstAccount.id);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unable to load accounts.";

        setLoadError(message);
      } finally {
        setLoading(false);
      }
    }

    loadAccounts();
  }, []);

  useEffect(() => {
    const existing = document.querySelector(
      'link[data-cleaning-world-leaflet="true"]'
    );

    if (!existing) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      link.setAttribute("data-cleaning-world-leaflet", "true");
      document.head.appendChild(link);
    }
  }, []);

  const managers = useMemo(() => {
    const unique = Array.from(
      new Set(accounts.map((account) => account.manager).filter(Boolean))
    ).sort();

    return ["All Managers", ...unique];
  }, [accounts]);

  const subs = useMemo(() => {
    const unique = Array.from(
      new Set(accounts.map((account) => account.subcontractor).filter(Boolean))
    ).sort();

    return ["All Subs", ...unique];
  }, [accounts]);

  const filteredAccounts = useMemo(() => {
    const query = search.toLowerCase().trim();

    const filtered = accounts.filter((account) => {
      const matchesSearch =
        !query ||
        account.name.toLowerCase().includes(query) ||
        account.address.toLowerCase().includes(query) ||
        account.cityStateZip.toLowerCase().includes(query) ||
        account.manager.toLowerCase().includes(query) ||
        account.subcontractor.toLowerCase().includes(query);

      const matchesManager =
        managerFilter === "All Managers" || account.manager === managerFilter;

      const matchesSub =
        subFilter === "All Subs" || account.subcontractor === subFilter;

      return matchesSearch && matchesManager && matchesSub;
    });

    if (!userLocation) {
      return filtered;
    }

    return [...filtered].sort((a, b) => {
      if (!hasCoordinates(a) || !hasCoordinates(b)) return 0;

      const distanceA = haversineMiles(
        userLocation,
        a.latitude as number,
        a.longitude as number
      );

      const distanceB = haversineMiles(
        userLocation,
        b.latitude as number,
        b.longitude as number
      );

      return distanceA - distanceB;
    });
  }, [accounts, managerFilter, search, subFilter, userLocation]);

  const accountsWithPins = useMemo(() => {
    return filteredAccounts.filter(hasCoordinates);
  }, [filteredAccounts]);

  const selectedAccount = useMemo(() => {
    return (
      accounts.find((account) => account.id === selectedAccountId) ||
      filteredAccounts[0] ||
      accounts[0] ||
      null
    );
  }, [accounts, filteredAccounts, selectedAccountId]);

  useEffect(() => {
    async function initializeMap() {
      if (!mapContainerRef.current || mapRef.current) return;

      const leaflet = await import("leaflet");

      const map = leaflet.map(mapContainerRef.current).setView(
        [40.8584, -74.1638],
        10
      );

      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(map);

      const markersLayer = leaflet.layerGroup().addTo(map);

      mapRef.current = map;
      markersLayerRef.current = markersLayer;
    }

    initializeMap();
  }, []);

  useEffect(() => {
    async function renderMarkers() {
      if (!mapRef.current || !markersLayerRef.current) return;

      const leaflet = await import("leaflet");

      const map = mapRef.current as import("leaflet").Map;
      const markersLayer =
        markersLayerRef.current as import("leaflet").LayerGroup;

      markersLayer.clearLayers();

      const bounds: import("leaflet").LatLngExpression[] = [];

      const accountIcon = leaflet.divIcon({
        className: "",
        html: `<div style="
          width: 22px;
          height: 22px;
          border-radius: 999px;
          background: #dc2626;
          border: 3px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,.35);
        "></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });

      const selectedIcon = leaflet.divIcon({
        className: "",
        html: `<div style="
          width: 28px;
          height: 28px;
          border-radius: 999px;
          background: #1d4ed8;
          border: 4px solid white;
          box-shadow: 0 3px 10px rgba(0,0,0,.45);
        "></div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      accountsWithPins.forEach((account) => {
        if (!hasCoordinates(account)) return;

        const isSelected = account.id === selectedAccount?.id;
        const position: import("leaflet").LatLngExpression = [
          account.latitude as number,
          account.longitude as number,
        ];

        bounds.push(position);

        const directionsUrl = buildDirectionsUrl(account, userLocation);
        const mapsUrl = buildGoogleMapsUrl(account);
        const accountUrl = `/accounts/${encodeURIComponent(account.id)}`;

        const marker = leaflet
          .marker(position, {
            icon: isSelected ? selectedIcon : accountIcon,
          })
          .addTo(markersLayer);

        marker.bindPopup(`
          <div style="min-width: 220px;">
            <strong style="font-size: 14px;">${account.name}</strong>
            <div style="margin-top: 4px; font-size: 12px;">
              ${buildFullAddress(account)}
            </div>
            <div style="margin-top: 6px; font-size: 12px;">
              Status: ${account.status || "N/A"}
            </div>
            <div style="margin-top: 10px; display: grid; gap: 6px;">
              <a href="${directionsUrl}" target="_blank" rel="noopener noreferrer">
                Get Directions
              </a>
              <a href="${mapsUrl}" target="_blank" rel="noopener noreferrer">
                Open in Google Maps
              </a>
              <a href="${accountUrl}">
                Open Account Detail
              </a>
            </div>
          </div>
        `);

        marker.on("click", () => {
          setSelectedAccountId(account.id);
        });
      });

      if (userLocation) {
        const userPosition: import("leaflet").LatLngExpression = [
          userLocation.latitude,
          userLocation.longitude,
        ];

        bounds.push(userPosition);

        leaflet
          .circleMarker(userPosition, {
            radius: 10,
            weight: 4,
            color: "#ffffff",
            fillColor: "#2563eb",
            fillOpacity: 1,
          })
          .addTo(markersLayer)
          .bindPopup("<strong>You are here</strong>");
      }

      if (selectedAccount && hasCoordinates(selectedAccount)) {
        map.setView(
          [
            selectedAccount.latitude as number,
            selectedAccount.longitude as number,
          ],
          14
        );
      } else if (bounds.length > 0) {
        map.fitBounds(leaflet.latLngBounds(bounds), {
          padding: [40, 40],
          maxZoom: 13,
        });
      }
    }

    renderMarkers();
  }, [accountsWithPins, selectedAccount, userLocation]);

  function handleUseCurrentLocation() {
    setLocationError("");

    if (!navigator.geolocation) {
      setLocationError("Your browser does not support current location.");
      return;
    }

    setUsingLocation(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });

        setUsingLocation(false);
      },
      () => {
        setLocationError(
          "Could not get your current location. Make sure location permission is allowed."
        );

        setUsingLocation(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 30000,
      }
    );
  }

  function clearFilters() {
    setSearch("");
    setManagerFilter("All Managers");
    setSubFilter("All Subs");
  }

  const selectedDistance =
    userLocation && selectedAccount && hasCoordinates(selectedAccount)
      ? haversineMiles(
          userLocation,
          selectedAccount.latitude as number,
          selectedAccount.longitude as number
        )
      : null;

  return (
    <main style={styles.page}>
      <section style={styles.shell}>
        <div style={styles.headerRow}>
          <div>
            <h1 style={styles.title}>Account Map</h1>
            <p style={styles.subtitle}>
              View Cleaning World accounts as pins, see your current location,
              and get directions.
            </p>
          </div>

          <div style={styles.headerActions}>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              style={styles.primaryButton}
            >
              {usingLocation ? "Finding Location..." : "Use My Current Location"}
            </button>

            <Link href="/accounts" style={styles.secondaryButton}>
              Back to Accounts
            </Link>
          </div>
        </div>

        {locationError ? <div style={styles.errorBox}>{locationError}</div> : null}
        {loadError ? <div style={styles.errorBox}>{loadError}</div> : null}

        <section style={styles.filtersCard}>
          <div style={styles.filterGrid}>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search account, address, manager, or sub..."
              style={styles.input}
            />

            <select
              value={managerFilter}
              onChange={(event) => setManagerFilter(event.target.value)}
              style={styles.input}
            >
              {managers.map((manager) => (
                <option key={manager} value={manager}>
                  {manager}
                </option>
              ))}
            </select>

            <select
              value={subFilter}
              onChange={(event) => setSubFilter(event.target.value)}
              style={styles.input}
            >
              {subs.map((sub) => (
                <option key={sub} value={sub}>
                  {sub}
                </option>
              ))}
            </select>

            <button type="button" onClick={clearFilters} style={styles.clearButton}>
              Clear Filters
            </button>
          </div>

          <div style={styles.selectRow}>
            <label style={styles.label}>
              Select Account
              <select
                value={selectedAccount?.id || ""}
                onChange={(event) => setSelectedAccountId(event.target.value)}
                style={styles.accountSelect}
              >
                {filteredAccounts.map((account) => {
                  const pinText = hasCoordinates(account) ? "📍" : "No pin";

                  return (
                    <option key={account.id} value={account.id}>
                      {account.name} — {pinText}
                    </option>
                  );
                })}
              </select>
            </label>

            <div style={styles.countPill}>
              {filteredAccounts.length} accounts found
            </div>

            <div style={styles.countPill}>
              {accountsWithPins.length} pins on map
            </div>
          </div>
        </section>

        <section style={styles.contentGrid}>
          <div style={styles.mapCard}>
            {loading ? (
              <div style={styles.loadingBox}>Loading accounts...</div>
            ) : accountsWithPins.length === 0 ? (
              <div style={styles.loadingBox}>
                No account pins yet. Add Latitude and Longitude to a few accounts
                in Google Sheets.
              </div>
            ) : null}

            <div ref={mapContainerRef} style={styles.map} />
          </div>

          <aside style={styles.sideCard}>
            <h2 style={styles.sideTitle}>Selected Account</h2>

            {selectedAccount ? (
              <>
                <div style={styles.selectedBox}>
                  <h3 style={styles.selectedName}>{selectedAccount.name}</h3>
                  <p style={styles.selectedAddress}>
                    {buildFullAddress(selectedAccount)}
                  </p>

                  {selectedDistance !== null ? (
                    <p style={styles.distanceText}>
                      About {selectedDistance.toFixed(1)} miles away
                    </p>
                  ) : null}
                </div>

                <div style={styles.details}>
                  <p>
                    <strong>Status:</strong> {selectedAccount.status || "N/A"}
                  </p>
                  <p>
                    <strong>Manager:</strong> {selectedAccount.manager || "N/A"}
                  </p>
                  <p>
                    <strong>Sub:</strong>{" "}
                    {selectedAccount.subcontractor || "N/A"}
                  </p>
                  <p>
                    <strong>Pin:</strong>{" "}
                    {hasCoordinates(selectedAccount)
                      ? "Available"
                      : "Missing Latitude/Longitude"}
                  </p>
                </div>

                <div style={styles.buttonStack}>
                  <a
                    href={buildDirectionsUrl(selectedAccount, userLocation)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.primaryLink}
                  >
                    Get Directions
                  </a>

                  <a
                    href={buildGoogleMapsUrl(selectedAccount)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={styles.secondaryLink}
                  >
                    Open in Google Maps
                  </a>

                  <Link
                    href={`/accounts/${encodeURIComponent(selectedAccount.id)}`}
                    style={styles.secondaryLink}
                  >
                    Open Account Detail
                  </Link>

                  <Link
                    href={`/visits/new?accountId=${encodeURIComponent(
                      selectedAccount.id
                    )}`}
                    style={styles.secondaryLink}
                  >
                    Add Visit
                  </Link>

                  <Link
                    href={`/complaints/new?accountId=${encodeURIComponent(
                      selectedAccount.id
                    )}`}
                    style={styles.secondaryLink}
                  >
                    Add Complaint
                  </Link>
                </div>

                <p style={styles.note}>
                  This page reads account information only. It does not save or
                  edit anything.
                </p>
              </>
            ) : (
              <p style={styles.note}>Select an account to view details.</p>
            )}
          </aside>
        </section>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    padding: "clamp(10px, 3vw, 24px)",
    background: "#eef4fb",
    minHeight: "100vh",
  },
  shell: {
    maxWidth: "1400px",
    margin: "0 auto",
    background: "#ffffff",
    borderRadius: "clamp(14px, 3vw, 22px)",
    padding: "clamp(14px, 3vw, 28px)",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.08)",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "14px",
    flexWrap: "wrap",
    marginBottom: "18px",
  },
  title: {
    margin: 0,
    fontSize: "clamp(24px, 6vw, 30px)",
    color: "#0f172a",
    lineHeight: 1.1,
  },
  subtitle: {
    margin: "8px 0 0",
    color: "#475569",
    fontSize: "clamp(14px, 3.5vw, 16px)",
    lineHeight: 1.4,
  },
  headerActions: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
    width: "100%",
    maxWidth: "520px",
  },
  primaryButton: {
    background: "#1d4ed8",
    color: "#ffffff",
    border: "none",
    borderRadius: "12px",
    padding: "15px 16px",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 6px 16px rgba(29, 78, 216, 0.25)",
    width: "100%",
    minHeight: "48px",
    fontSize: "15px",
  },
  secondaryButton: {
    background: "#ffffff",
    color: "#0f172a",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "15px 16px",
    fontWeight: 900,
    textDecoration: "none",
    boxShadow: "0 4px 10px rgba(15, 23, 42, 0.08)",
    width: "100%",
    minHeight: "48px",
    textAlign: "center",
    fontSize: "15px",
  },
  errorBox: {
    background: "#fee2e2",
    color: "#991b1b",
    border: "1px solid #fecaca",
    borderRadius: "12px",
    padding: "12px 14px",
    marginBottom: "14px",
    fontWeight: 800,
    fontSize: "14px",
  },
  filtersCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "14px",
    padding: "clamp(12px, 3vw, 20px)",
    marginBottom: "18px",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.06)",
    background: "#ffffff",
  },
  filterGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: "10px",
    marginBottom: "14px",
  },
  input: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "14px 14px",
    fontSize: "16px",
    color: "#0f172a",
    background: "#ffffff",
    minHeight: "50px",
  },
  clearButton: {
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "14px 14px",
    fontWeight: 900,
    background: "#ffffff",
    cursor: "pointer",
    minHeight: "50px",
    fontSize: "15px",
  },
  selectRow: {
    display: "grid",
    gridTemplateColumns: "minmax(220px, 1fr)",
    gap: "10px",
    alignItems: "stretch",
  },
  label: {
    display: "grid",
    gap: "8px",
    fontWeight: 900,
    color: "#0f172a",
    fontSize: "13px",
  },
  accountSelect: {
    width: "100%",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "14px 14px",
    fontSize: "16px",
    color: "#0f172a",
    background: "#ffffff",
    minHeight: "50px",
  },
  countPill: {
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "12px 14px",
    color: "#0f172a",
    fontWeight: 900,
    background: "#f8fafc",
    textAlign: "center",
    fontSize: "14px",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))",
    gap: "16px",
    alignItems: "start",
  },
  mapCard: {
    position: "relative",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    overflow: "hidden",
    minHeight: "clamp(420px, 68vh, 680px)",
    background: "#f8fafc",
    order: 1,
  },
  map: {
    width: "100%",
    height: "clamp(420px, 68vh, 680px)",
    minHeight: "420px",
    zIndex: 1,
  },
  loadingBox: {
    position: "absolute",
    top: "12px",
    left: "12px",
    right: "12px",
    zIndex: 10,
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "12px",
    padding: "12px 14px",
    color: "#0f172a",
    fontWeight: 900,
    boxShadow: "0 6px 18px rgba(15, 23, 42, 0.12)",
    fontSize: "14px",
  },
  sideCard: {
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "clamp(14px, 3vw, 20px)",
    alignSelf: "start",
    boxShadow: "0 4px 12px rgba(15, 23, 42, 0.06)",
    background: "#ffffff",
    order: 2,
  },
  sideTitle: {
    margin: "0 0 14px",
    fontSize: "clamp(19px, 5vw, 22px)",
    color: "#0f172a",
  },
  selectedBox: {
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: "12px",
    padding: "14px",
    marginBottom: "14px",
  },
  selectedName: {
    margin: "0 0 8px",
    color: "#1d4ed8",
    fontSize: "clamp(17px, 4.5vw, 19px)",
    lineHeight: 1.25,
  },
  selectedAddress: {
    margin: 0,
    color: "#0f172a",
    fontSize: "14px",
    lineHeight: 1.4,
  },
  distanceText: {
    margin: "10px 0 0",
    color: "#0f172a",
    fontWeight: 900,
    fontSize: "15px",
  },
  details: {
    color: "#0f172a",
    fontSize: "14px",
    lineHeight: 1.5,
  },
  buttonStack: {
    display: "grid",
    gap: "10px",
    marginTop: "18px",
  },
  primaryLink: {
    background: "#1d4ed8",
    color: "#ffffff",
    borderRadius: "12px",
    padding: "15px 14px",
    textAlign: "center",
    fontWeight: 900,
    textDecoration: "none",
    minHeight: "50px",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryLink: {
    background: "#ffffff",
    color: "#0f172a",
    border: "1px solid #cbd5e1",
    borderRadius: "12px",
    padding: "15px 14px",
    textAlign: "center",
    fontWeight: 900,
    textDecoration: "none",
    minHeight: "50px",
    fontSize: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  note: {
    marginTop: "18px",
    color: "#475569",
    fontSize: "12px",
    lineHeight: 1.5,
  },
};