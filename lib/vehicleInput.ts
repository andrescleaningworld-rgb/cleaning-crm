// Parses and cleans the Vehicles admin form bodies (server side).
import type { ServiceItemInput, VehicleInput } from "@/lib/vehiclesDb";

export const MAX_MILEAGE = 2_000_000;

const text = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);

export function parseMileage(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Math.round(Number(String(v).replace(/[,\s]/g, "")));
  return Number.isFinite(n) && n >= 0 && n <= MAX_MILEAGE ? n : NaN;
}

export function parsePositiveInt(v: unknown): number | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

export function parseDate(v: unknown): string | null {
  const s = text(v, 10);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? s : "invalid";
}

export function parseVehicleInput(body: Record<string, unknown>): VehicleInput | string {
  const name = text(body.name, 100);
  if (!name) return "Type a name first.";
  const yearRaw = text(body.year, 4);
  const year = yearRaw ? Number(yearRaw) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1950 || year > 2100)) return "Year doesn't look right.";
  return {
    name,
    plate: text(body.plate, 20).toUpperCase(),
    vin: text(body.vin, 17).toUpperCase(),
    year,
    make: text(body.make, 50),
    model: text(body.model, 50),
    photoUrl: text(body.photoUrl, 500),
    driverStaffId: text(body.driverStaffId, 100) || null,
  };
}

export function parseServiceItemInput(body: Record<string, unknown>): ServiceItemInput | string {
  const name = text(body.name, 80);
  if (!name) return "Type a name for the item.";
  const intervalMiles = parsePositiveInt(body.intervalMiles);
  const intervalMonths = parsePositiveInt(body.intervalMonths);
  const lastDoneMileage = parseMileage(body.lastDoneMileage);
  const dueDate = parseDate(body.dueDate);
  const lastDoneDate = parseDate(body.lastDoneDate);
  if (Number.isNaN(intervalMiles) || Number.isNaN(intervalMonths)) return "Intervals must be whole numbers above 0.";
  if (Number.isNaN(lastDoneMileage)) return "Mileage doesn't look right.";
  if (dueDate === "invalid" || lastDoneDate === "invalid") return "Date doesn't look right.";
  return { name, intervalMiles, intervalMonths, dueDate, lastDoneDate, lastDoneMileage, active: body.active !== false };
}

// Vehicles show on the Equipment Check tablet as id "vehicle:<n>".
export function vehicleIdFromTabletId(value: unknown): number | null {
  const match = /^vehicle:(\d+)$/.exec(String(value ?? "").trim());
  return match ? Number(match[1]) : null;
}
