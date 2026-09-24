// Vehicles (Equipment → "Vehicles"). Postgres only — tables from
// scripts/setup-vehicles-db.js. No Sheets access in this file; the driver
// is stored as the Sheets Staff id and named by callers via fetchStaff().
// DATE columns are always read back as "YYYY-MM-DD" text (::text), never as
// JS Dates, so a timezone can't shift them by a day.
import { getSql } from "@/lib/db";
import { DEFAULT_SERVICE_ITEMS } from "@/lib/vehicleDue";

export type Vehicle = {
  id: number;
  name: string;
  plate: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  photoUrl: string;
  driverStaffId: string | null;
  currentMileage: number | null;
  mileageUpdatedAt: string | null;
  active: boolean;
  createdAt: string;
};

export type VehicleServiceItem = {
  id: number;
  vehicleId: number;
  name: string;
  intervalMiles: number | null;
  intervalMonths: number | null;
  dueDate: string | null;
  lastDoneDate: string | null;
  lastDoneMileage: number | null;
  sortOrder: number;
  active: boolean;
};

export type VehicleServiceLog = {
  id: number;
  vehicleId: number;
  serviceItemId: number | null;
  doneOn: string;
  mileage: number | null;
  serviceType: string;
  notes: string;
  what: string;
  shop: string;
  cost: number | null;
  receiptUrl: string;
  createdBy: string;
  createdAt: string;
};

export type VehicleMileageReading = {
  id: number;
  vehicleId: number;
  mileage: number;
  staffId: string | null;
  source: "tablet" | "office" | "service";
  // Lower than the vehicle's mileage at the time — kept, never used to
  // lower the mileage that drives service reminders.
  flaggedLower: boolean;
  createdAt: string;
};

export type VehicleInput = {
  name: string;
  plate: string;
  vin: string;
  year: number | null;
  make: string;
  model: string;
  photoUrl: string;
  driverStaffId: string | null;
};

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

function rowToVehicle(row: Record<string, unknown>): Vehicle {
  return {
    id: row.id as number,
    name: row.name as string,
    plate: row.plate as string,
    vin: row.vin as string,
    year: numOrNull(row.year),
    make: row.make as string,
    model: row.model as string,
    photoUrl: row.photo_url as string,
    driverStaffId: (row.driver_staff_id as string | null) ?? null,
    currentMileage: numOrNull(row.current_mileage),
    mileageUpdatedAt: row.mileage_updated_at ? toIso(row.mileage_updated_at) : null,
    active: row.active as boolean,
    createdAt: toIso(row.created_at),
  };
}

function rowToItem(row: Record<string, unknown>): VehicleServiceItem {
  return {
    id: row.id as number,
    vehicleId: row.vehicle_id as number,
    name: row.name as string,
    intervalMiles: numOrNull(row.interval_miles),
    intervalMonths: numOrNull(row.interval_months),
    dueDate: (row.due_date as string | null) ?? null,
    lastDoneDate: (row.last_done_date as string | null) ?? null,
    lastDoneMileage: numOrNull(row.last_done_mileage),
    sortOrder: row.sort_order as number,
    active: row.active as boolean,
  };
}

function rowToLog(row: Record<string, unknown>): VehicleServiceLog {
  return {
    id: row.id as number,
    vehicleId: row.vehicle_id as number,
    serviceItemId: numOrNull(row.service_item_id),
    doneOn: row.done_on as string,
    mileage: numOrNull(row.mileage),
    serviceType: (row.service_type as string) ?? "Other",
    notes: (row.notes as string) ?? "",
    what: row.what as string,
    shop: row.shop as string,
    cost: numOrNull(row.cost),
    receiptUrl: row.receipt_url as string,
    createdBy: row.created_by as string,
    createdAt: toIso(row.created_at),
  };
}

function rowToReading(row: Record<string, unknown>): VehicleMileageReading {
  return {
    id: row.id as number,
    vehicleId: row.vehicle_id as number,
    mileage: Number(row.mileage),
    staffId: (row.staff_id as string | null) ?? null,
    source: row.source as VehicleMileageReading["source"],
    flaggedLower: row.flagged_lower === true,
    createdAt: toIso(row.created_at),
  };
}

// ─── Vehicles ────────────────────────────────────────────────────────────

export async function listVehicles(includeRetired = true): Promise<Vehicle[]> {
  const sql = getSql();
  const rows = includeRetired
    ? await sql`SELECT * FROM vehicles ORDER BY active DESC, name`
    : await sql`SELECT * FROM vehicles WHERE active ORDER BY name`;
  return rows.map((r) => rowToVehicle(r as Record<string, unknown>));
}

export async function getVehicle(id: number): Promise<Vehicle | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM vehicles WHERE id = ${id}`;
  return rows[0] ? rowToVehicle(rows[0] as Record<string, unknown>) : null;
}

// New vehicle + the default service items, in one transaction.
export async function createVehicle(input: VehicleInput, currentMileage: number | null): Promise<Vehicle> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO vehicles (name, plate, vin, year, make, model, photo_url, driver_staff_id, current_mileage, mileage_updated_at)
    VALUES (${input.name}, ${input.plate}, ${input.vin}, ${input.year}, ${input.make}, ${input.model}, ${input.photoUrl},
            ${input.driverStaffId}, ${currentMileage}, ${currentMileage === null ? null : new Date().toISOString()})
    RETURNING *
  `;
  const vehicle = rowToVehicle(rows[0] as Record<string, unknown>);
  await sql.transaction(
    DEFAULT_SERVICE_ITEMS.map(
      (item, index) => sql`
        INSERT INTO vehicle_service_items (vehicle_id, name, interval_miles, interval_months, sort_order)
        VALUES (${vehicle.id}, ${item.name}, ${item.intervalMiles}, ${item.intervalMonths}, ${index})
      `
    )
  );
  if (currentMileage !== null) {
    await sql`INSERT INTO vehicle_mileage_readings (vehicle_id, mileage, source) VALUES (${vehicle.id}, ${currentMileage}, 'office')`;
  }
  return vehicle;
}

export async function updateVehicle(id: number, input: VehicleInput): Promise<void> {
  const sql = getSql();
  await sql`
    UPDATE vehicles SET name = ${input.name}, plate = ${input.plate}, vin = ${input.vin}, year = ${input.year},
      make = ${input.make}, model = ${input.model}, photo_url = ${input.photoUrl}, driver_staff_id = ${input.driverStaffId},
      updated_at = now()
    WHERE id = ${id}
  `;
}

export async function setVehicleActive(id: number, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE vehicles SET active = ${active}, updated_at = now() WHERE id = ${id}`;
}

// ─── Mileage ─────────────────────────────────────────────────────────────

// Every reading is kept. The vehicle's current mileage only moves UP from a
// tablet or service reading — a lower one is saved with flagged_lower and
// never lowers the mileage used for service reminders. Only the office's
// "Update mileage" (`force`) can set a lower number, to correct a typo.
export async function recordMileage(input: {
  vehicleId: number;
  mileage: number;
  staffId: string | null;
  source: VehicleMileageReading["source"];
  force?: boolean;
}): Promise<{ reading: VehicleMileageReading; currentMileage: number | null }> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO vehicle_mileage_readings (vehicle_id, mileage, staff_id, source, flagged_lower)
    VALUES (${input.vehicleId}, ${input.mileage}, ${input.staffId}, ${input.source},
            ${!input.force} AND COALESCE((SELECT current_mileage FROM vehicles WHERE id = ${input.vehicleId}), 0) > ${input.mileage})
    RETURNING *
  `;
  const updated = input.force
    ? await sql`
        UPDATE vehicles SET current_mileage = ${input.mileage}, mileage_updated_at = now(), updated_at = now()
        WHERE id = ${input.vehicleId} RETURNING current_mileage
      `
    : await sql`
        UPDATE vehicles SET current_mileage = GREATEST(COALESCE(current_mileage, 0), ${input.mileage}), mileage_updated_at = now(), updated_at = now()
        WHERE id = ${input.vehicleId} RETURNING current_mileage
      `;
  return { reading: rowToReading(rows[0] as Record<string, unknown>), currentMileage: numOrNull(updated[0]?.current_mileage) };
}

export async function listMileageReadings(vehicleId: number, limit = 20): Promise<VehicleMileageReading[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM vehicle_mileage_readings WHERE vehicle_id = ${vehicleId} ORDER BY created_at DESC, id DESC LIMIT ${limit}`;
  return rows.map((r) => rowToReading(r as Record<string, unknown>));
}

// ─── Service items ───────────────────────────────────────────────────────

export async function listServiceItems(vehicleIds: number[]): Promise<VehicleServiceItem[]> {
  if (vehicleIds.length === 0) return [];
  const sql = getSql();
  const rows = await sql`
    SELECT id, vehicle_id, name, interval_miles, interval_months, due_date::text AS due_date,
      last_done_date::text AS last_done_date, last_done_mileage, sort_order, active
    FROM vehicle_service_items
    WHERE vehicle_id = ANY(${vehicleIds}) ORDER BY vehicle_id, sort_order, id
  `;
  return rows.map((r) => rowToItem(r as Record<string, unknown>));
}

export type ServiceItemInput = {
  name: string;
  intervalMiles: number | null;
  intervalMonths: number | null;
  dueDate: string | null;
  lastDoneDate: string | null;
  lastDoneMileage: number | null;
  active: boolean;
};

export async function saveServiceItem(vehicleId: number, itemId: number | null, input: ServiceItemInput): Promise<void> {
  const sql = getSql();
  if (itemId) {
    await sql`
      UPDATE vehicle_service_items SET name = ${input.name}, interval_miles = ${input.intervalMiles},
        interval_months = ${input.intervalMonths}, due_date = ${input.dueDate}, last_done_date = ${input.lastDoneDate},
        last_done_mileage = ${input.lastDoneMileage}, active = ${input.active}
      WHERE id = ${itemId} AND vehicle_id = ${vehicleId}
    `;
    return;
  }
  await sql`
    INSERT INTO vehicle_service_items (vehicle_id, name, interval_miles, interval_months, due_date, last_done_date, last_done_mileage, active, sort_order)
    VALUES (${vehicleId}, ${input.name}, ${input.intervalMiles}, ${input.intervalMonths}, ${input.dueDate},
            ${input.lastDoneDate}, ${input.lastDoneMileage}, ${input.active},
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM vehicle_service_items WHERE vehicle_id = ${vehicleId}))
  `;
}

// ─── Service log ─────────────────────────────────────────────────────────

export async function listServiceLogs(vehicleId: number, limit = 100): Promise<VehicleServiceLog[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, vehicle_id, service_item_id, done_on::text AS done_on, mileage, service_type, notes, what, shop, cost, receipt_url, created_by, created_at
    FROM vehicle_service_logs WHERE vehicle_id = ${vehicleId}
    ORDER BY done_on DESC, id DESC LIMIT ${limit}
  `;
  return rows.map((r) => rowToLog(r as Record<string, unknown>));
}

// Newest log per vehicle — "Last service: Alignment · Sep 10 · 48,200 mi".
export async function listLastServiceLogs(vehicleIds: number[]): Promise<VehicleServiceLog[]> {
  if (vehicleIds.length === 0) return [];
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT ON (vehicle_id)
      id, vehicle_id, service_item_id, done_on::text AS done_on, mileage, service_type, notes, what, shop, cost, receipt_url, created_by, created_at
    FROM vehicle_service_logs WHERE vehicle_id = ANY(${vehicleIds})
    ORDER BY vehicle_id, done_on DESC, id DESC
  `;
  return rows.map((r) => rowToLog(r as Record<string, unknown>));
}

// "Log service": saves the entry, marks the matching item done (date +
// mileage; a date-only item gets its next due date), and records the
// mileage reading.
export async function logService(input: {
  vehicleId: number;
  serviceItemId: number | null;
  doneOn: string;
  mileage: number | null;
  serviceType: string;
  notes: string;
  shop: string;
  cost: number | null;
  receiptUrl: string;
  createdBy: string;
  nextDueDate: string | null;
}): Promise<VehicleServiceLog> {
  const sql = getSql();
  const what = input.notes ? `${input.serviceType} — ${input.notes}` : input.serviceType;
  const rows = await sql`
    INSERT INTO vehicle_service_logs (vehicle_id, service_item_id, done_on, mileage, service_type, notes, what, shop, cost, receipt_url, created_by)
    VALUES (${input.vehicleId}, ${input.serviceItemId}, ${input.doneOn}, ${input.mileage}, ${input.serviceType}, ${input.notes},
            ${what}, ${input.shop}, ${input.cost}, ${input.receiptUrl}, ${input.createdBy})
    RETURNING id, vehicle_id, service_item_id, done_on::text AS done_on, mileage, service_type, notes, what, shop, cost, receipt_url, created_by, created_at
  `;
  if (input.serviceItemId) {
    await sql`
      UPDATE vehicle_service_items SET
        last_done_date = ${input.doneOn},
        last_done_mileage = COALESCE(${input.mileage}, last_done_mileage),
        due_date = COALESCE(${input.nextDueDate}, due_date)
      WHERE id = ${input.serviceItemId} AND vehicle_id = ${input.vehicleId}
    `;
  }
  if (input.mileage !== null) {
    await recordMileage({ vehicleId: input.vehicleId, mileage: input.mileage, staffId: null, source: "service" });
  }
  return rowToLog(rows[0] as Record<string, unknown>);
}

// ─── Weekly digest dedup ─────────────────────────────────────────────────

// Claims this week's Monday digest; false = already sent this week.
export async function claimVehicleDigestWeek(weekStart: string, itemCount: number): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO vehicle_digest_sent (week_start, item_count) VALUES (${weekStart}, ${itemCount})
    ON CONFLICT (week_start) DO NOTHING RETURNING week_start
  `;
  return rows.length > 0;
}
