// The Monday vehicle email's content: every active vehicle's OIL CHANGE when
// it's due soon (amber) or overdue (red) — other reminders are not emailed.
// Empty = nothing to send. Postgres only; driver names come from the caller.
import { listServiceItems, listVehicles } from "@/lib/vehiclesDb";
import { DUE_RANK, computeDue, isOilChangeItem, todayInCompanyTz, type DueInfo } from "@/lib/vehicleDue";

export type VehicleDigestGroup = { vehicleId: number; title: string; driverStaffId: string | null; due: DueInfo[] };

export async function buildVehicleDigest(today: string = todayInCompanyTz()): Promise<VehicleDigestGroup[]> {
  const vehicles = await listVehicles(false);
  const items = await listServiceItems(vehicles.map((v) => v.id));
  const groups: VehicleDigestGroup[] = [];
  for (const vehicle of vehicles) {
    const due = items
      .filter((item) => item.vehicleId === vehicle.id && item.active && isOilChangeItem(item))
      .map((item) => computeDue(item, vehicle.currentMileage, today))
      .filter((d) => d.level === "red" || d.level === "amber")
      .sort((a, b) => DUE_RANK[b.level] - DUE_RANK[a.level]);
    if (due.length > 0) {
      groups.push({ vehicleId: vehicle.id, title: [vehicle.name, vehicle.plate].filter(Boolean).join(" · "), driverStaffId: vehicle.driverStaffId, due });
    }
  }
  return groups.sort((a, b) => DUE_RANK[b.due[0].level] - DUE_RANK[a.due[0].level] || a.title.localeCompare(b.title));
}
