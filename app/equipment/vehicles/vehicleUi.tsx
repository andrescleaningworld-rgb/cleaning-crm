"use client";

// Shared pieces for the Vehicles screens: due colors, the driver list, and
// the one Add / Edit vehicle form. Same simple style as the Equipment
// screens (app/equipment/ui.tsx).
import { useEffect, useState } from "react";
import type { Vehicle, VehicleServiceItem, VehicleServiceLog } from "@/lib/vehiclesDb";
import { DUE_RANK, computeDue, isOilChangeItem, todayInCompanyTz, type DueInfo, type DueLevel } from "@/lib/vehicleDue";
import type { Staff } from "../types";
import { BigButton, EquipmentPhoto, ErrorNote, PhotoUploadButton, inputClass } from "../ui";

export const DUE_STYLE: Record<DueLevel, { row: string; dot: string; card: string; label: string }> = {
  red: { row: "bg-red-50 text-red-900", dot: "bg-red-500", card: "border-red-400", label: "Overdue" },
  amber: { row: "bg-amber-50 text-amber-900", dot: "bg-amber-500", card: "border-amber-400", label: "Due soon" },
  green: { row: "bg-green-50 text-green-900", dot: "bg-green-500", card: "border-green-300", label: "OK" },
  gray: { row: "bg-gray-50 text-gray-600", dot: "bg-gray-400", card: "border-gray-200", label: "Not logged" },
};

export function dueForVehicle(vehicle: Vehicle, items: VehicleServiceItem[]): { item: VehicleServiceItem; due: DueInfo }[] {
  return items
    .filter((item) => item.vehicleId === vehicle.id && item.active)
    .map((item) => ({ item, due: computeDue(item, vehicle.currentMileage) }))
    .sort((a, b) => DUE_RANK[b.due.level] - DUE_RANK[a.due.level] || a.item.sortOrder - b.item.sortOrder);
}

// The oil change reminder's status for this vehicle (null = reminder off).
export function oilDue(vehicle: Vehicle, items: VehicleServiceItem[]): DueInfo | null {
  const oil = items.find((item) => item.vehicleId === vehicle.id && item.active && isOilChangeItem(item));
  return oil ? computeDue(oil, vehicle.currentMileage) : null;
}

// "Sep 10" (this year) or "Sep 10, 2025".
export function formatMonthDay(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const sameYear = String(y) === todayInCompanyTz().slice(0, 4);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// "Alignment · Sep 10 · 48,200 mi"
export function lastServiceText(log: VehicleServiceLog): string {
  return [log.serviceType, formatMonthDay(log.doneOn), log.mileage !== null ? formatMiles(log.mileage) : null].filter(Boolean).join(" · ");
}

export function DueDot({ level }: { level: DueLevel }) {
  return <span className={`inline-block h-4 w-4 shrink-0 rounded-full ${DUE_STYLE[level].dot}`} aria-label={DUE_STYLE[level].label} />;
}

export function formatMiles(n: number | null): string {
  return n === null ? "—" : `${n.toLocaleString("en-US")} mi`;
}

// Drivers = the existing Staff list (Sheets Staff tab via /api/staff).
export function useStaffList(): Staff[] {
  const [staff, setStaff] = useState<Staff[]>([]);
  useEffect(() => {
    fetch("/api/staff", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { success?: boolean; staff?: Staff[] }) => {
        if (data.success && Array.isArray(data.staff)) setStaff(data.staff);
      })
      .catch(() => {
        // driver picker just shows "No driver" until reload
      });
  }, []);
  return staff;
}

type VehicleDraft = {
  name: string;
  plate: string;
  driverStaffId: string;
  currentMileage: string;
  vin: string;
  year: string;
  make: string;
  model: string;
  photoUrl: string;
};

function draftFrom(vehicle: Vehicle | null): VehicleDraft {
  return {
    name: vehicle?.name ?? "",
    plate: vehicle?.plate ?? "",
    driverStaffId: vehicle?.driverStaffId ?? "",
    currentMileage: "",
    vin: vehicle?.vin ?? "",
    year: vehicle?.year ? String(vehicle.year) : "",
    make: vehicle?.make ?? "",
    model: vehicle?.model ?? "",
    photoUrl: vehicle?.photoUrl ?? "",
  };
}

// Add (vehicle = null → POST /api/vehicles) or Edit (POST action "update").
// Mileage is only asked when adding — after that it has its own button.
export function VehicleForm({
  vehicle,
  staff,
  onSaved,
  onCancel,
}: {
  vehicle: Vehicle | null;
  staff: Staff[];
  onSaved: (id: number) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<VehicleDraft>(() => draftFrom(vehicle));
  const [showMore, setShowMore] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (field: keyof VehicleDraft) => (value: string) => setDraft((d) => ({ ...d, [field]: value }));

  const drivers = staff.filter((s) => s.active || s.id === draft.driverStaffId);

  async function save() {
    if (!draft.name.trim()) {
      setError("Type a name first.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const payload = { ...draft, driverStaffId: draft.driverStaffId || null };
      const res = await fetch(vehicle ? `/api/vehicles/${vehicle.id}` : "/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(vehicle ? { action: "update", ...payload } : payload),
      });
      const data = (await res.json()) as { success?: boolean; id?: number; error?: string };
      if (!data.success) {
        setError(data.error || "Could not save. Try again.");
        return;
      }
      onSaved(vehicle ? vehicle.id : data.id ?? 0);
    } catch {
      setError("No connection. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-3xl bg-white p-5 shadow-sm">
      <label className="block">
        <span className="text-lg font-bold text-gray-800">Name</span>
        <input value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. White van" className={inputClass} />
      </label>
      <label className="block">
        <span className="text-lg font-bold text-gray-800">License plate</span>
        <input value={draft.plate} onChange={(e) => set("plate")(e.target.value)} className={`${inputClass} uppercase`} />
      </label>
      <label className="block">
        <span className="text-lg font-bold text-gray-800">Driver</span>
        <select value={draft.driverStaffId} onChange={(e) => set("driverStaffId")(e.target.value)} className={inputClass}>
          <option value="">No driver</option>
          {drivers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {!vehicle ? (
        <label className="block">
          <span className="text-lg font-bold text-gray-800">Mileage now</span>
          <input
            type="number"
            inputMode="numeric"
            value={draft.currentMileage}
            onChange={(e) => set("currentMileage")(e.target.value)}
            placeholder="The number on the dashboard"
            className={inputClass}
          />
        </label>
      ) : null}

      <button type="button" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} className="min-h-[48px] text-lg font-bold text-blue-700">
        {showMore ? "▾ Hide more details" : "▸ More details (photo, VIN, year, make, model)"}
      </button>

      {showMore ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <EquipmentPhoto url={draft.photoUrl} name={draft.name || "Vehicle"} className="h-32 w-32 shrink-0 rounded-2xl" />
            <div className="grid w-full gap-2">
              <PhotoUploadButton label={draft.photoUrl ? "Change photo" : "Add photo"} onUploaded={set("photoUrl")} onUploadingChange={setUploading} onError={setError} />
              {draft.photoUrl ? (
                <button type="button" onClick={() => set("photoUrl")("")} className="text-base font-semibold text-gray-500 underline">
                  Remove photo
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-lg font-bold text-gray-800">Year</span>
              <input type="number" inputMode="numeric" value={draft.year} onChange={(e) => set("year")(e.target.value)} className={inputClass} />
            </label>
            <label className="block">
              <span className="text-lg font-bold text-gray-800">Make</span>
              <input value={draft.make} onChange={(e) => set("make")(e.target.value)} placeholder="e.g. Ford" className={inputClass} />
            </label>
            <label className="block">
              <span className="text-lg font-bold text-gray-800">Model</span>
              <input value={draft.model} onChange={(e) => set("model")(e.target.value)} placeholder="e.g. Transit" className={inputClass} />
            </label>
          </div>
          <label className="block">
            <span className="text-lg font-bold text-gray-800">VIN</span>
            <input value={draft.vin} onChange={(e) => set("vin")(e.target.value)} maxLength={17} className={`${inputClass} uppercase`} />
          </label>
        </div>
      ) : null}

      <ErrorNote message={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <BigButton label="Cancel" onClick={onCancel} disabled={saving} />
        <BigButton icon="✔" label={saving ? "Saving…" : vehicle ? "Save changes" : "Add vehicle"} tone="green" onClick={save} disabled={saving || uploading} />
      </div>
    </div>
  );
}
