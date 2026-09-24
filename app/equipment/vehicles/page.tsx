"use client";

// Vehicles (inside Equipment): one big "Add vehicle" button, a search box,
// and a photo card per vehicle showing the most urgent service item in
// plain words and its color (red overdue / amber due soon / green OK).
// Retired vehicles sit under a "Retired" chip. Postgres via /api/vehicles.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Vehicle, VehicleServiceItem } from "@/lib/vehiclesDb";
import { BigButton, EquipmentPhoto, EquipmentShell, ErrorNote } from "../ui";
import { DUE_STYLE, DueDot, dueForVehicle, formatMiles, useStaffList } from "./vehicleUi";

export default function VehiclesPage() {
  const staff = useStaffList();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [items, setItems] = useState<VehicleServiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [showRetired, setShowRetired] = useState(false);

  useEffect(() => {
    fetch("/api/vehicles", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success?: boolean; vehicles?: Vehicle[]; items?: VehicleServiceItem[]; error?: string }) => {
        if (!data.success) setLoadError(data.error || "Could not load vehicles.");
        else {
          setVehicles(data.vehicles ?? []);
          setItems(data.items ?? []);
        }
      })
      .catch(() => setLoadError("No connection. Reload the page."))
      .finally(() => setLoading(false));
  }, []);

  const staffName = useMemo(() => new Map(staff.map((s) => [s.id, s.name])), [staff]);
  const retiredCount = vehicles.filter((v) => !v.active).length;
  const query = search.trim().toLowerCase();
  const shown = vehicles.filter(
    (v) =>
      v.active !== showRetired &&
      (!query ||
        [v.name, v.plate, v.make, v.model, v.driverStaffId ? staffName.get(v.driverStaffId) ?? "" : ""].some((t) => t.toLowerCase().includes(query)))
  );

  return (
    <EquipmentShell back={{ href: "/equipment", label: "Equipment" }} title="Vehicles">
      <BigButton icon="➕" label="Add vehicle" tone="green" href="/equipment/vehicles/new" className="w-full" />

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Search by name, plate or driver"
        aria-label="Search vehicles"
        className="min-h-[64px] w-full rounded-2xl border-2 border-gray-300 bg-white px-5 text-xl outline-none focus:border-blue-600"
      />

      <div className="flex flex-wrap gap-2">
        {[false, true].map((retired) => (
          <button
            key={String(retired)}
            type="button"
            onClick={() => setShowRetired(retired)}
            aria-pressed={showRetired === retired}
            className={`min-h-[52px] rounded-full border-2 px-4 text-lg font-bold ${
              showRetired === retired ? "border-blue-700 bg-blue-700 text-white" : "border-gray-300 bg-white text-gray-800 hover:bg-gray-100"
            }`}
          >
            {retired ? `Retired ${retiredCount}` : `In use ${vehicles.length - retiredCount}`}
          </button>
        ))}
      </div>

      <ErrorNote message={loadError} />

      {loading ? (
        <p className="p-8 text-center text-xl text-gray-600">Loading…</p>
      ) : shown.length === 0 && !loadError ? (
        <p className="rounded-2xl bg-white p-8 text-center text-xl text-gray-600 shadow-sm">
          {query ? "Nothing matches that search." : showRetired ? "No retired vehicles." : "No vehicles yet — tap Add vehicle."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((vehicle) => {
            const dues = dueForVehicle(vehicle, items);
            const top = dues[0]?.due;
            const urgentCount = dues.filter((d) => d.due.level === "red" || d.due.level === "amber").length;
            return (
              <Link
                key={vehicle.id}
                href={`/equipment/vehicles/${vehicle.id}`}
                className={`overflow-hidden rounded-3xl border-4 bg-white shadow-sm transition hover:shadow-md ${
                  vehicle.active && top ? DUE_STYLE[top.level].card : "border-gray-200"
                }`}
              >
                <EquipmentPhoto url={vehicle.photoUrl} name={vehicle.name} className="h-40 w-full" />
                <div className="space-y-2 p-4">
                  <p className="text-2xl font-black text-gray-900">{vehicle.name}</p>
                  <p className="text-lg text-gray-600">
                    {[vehicle.plate, vehicle.driverStaffId ? staffName.get(vehicle.driverStaffId) : null, formatMiles(vehicle.currentMileage)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {vehicle.active && top ? (
                    <p className={`flex items-center gap-2 rounded-xl px-3 py-2 text-lg font-semibold ${DUE_STYLE[top.level].row}`}>
                      <DueDot level={top.level} />
                      {top.text}
                      {urgentCount > 1 ? ` (+${urgentCount - 1} more)` : ""}
                    </p>
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </EquipmentShell>
  );
}
