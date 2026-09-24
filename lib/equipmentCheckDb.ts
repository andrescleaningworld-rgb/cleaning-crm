// Postgres layer for the Equipment Check tablet app
// (docs/equipment-check-spec.md). Tables come from
// scripts/setup-equipment-check-db.js. People and equipment stay in Sheets
// (Staff / Equipment tabs) and are only ever READ from there — this module
// stores ids only, never names, and never writes to Sheets.
import crypto from "node:crypto";
import { getSql } from "@/lib/db";
import { hashPin, comparePin, nextFailedPinState } from "@/lib/pinAuth";

export const PIN_SETUP_WINDOW_HOURS = 48;

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

function toIsoOrNull(value: unknown): string | null {
  return value ? toIso(value) : null;
}

// ─── Secret tablet link ───────────────────────────────────────────────────

export type EquipmentCheckLink = { key: string; keyVersion: number };

function generateLinkKey(): string {
  // Same construction as Team Hub crew tokens (lib/teamHubDb.ts
  // generateCrewToken): 24 random bytes -> 32 URL-safe chars.
  return crypto.randomBytes(24).toString("base64url");
}

export async function getOrCreateEquipmentCheckLink(): Promise<EquipmentCheckLink> {
  const sql = getSql();
  await sql`
    INSERT INTO equipment_check_link (id, link_key) VALUES (1, ${generateLinkKey()})
    ON CONFLICT (id) DO NOTHING
  `;
  const rows = await sql`SELECT link_key, key_version FROM equipment_check_link WHERE id = 1`;
  const row = rows[0] as Record<string, unknown>;
  return { key: row.link_key as string, keyVersion: row.key_version as number };
}

// Replaces the key (old link stops working at once) and bumps the version,
// which signs out any tablet session made under the old link.
export async function regenerateEquipmentCheckLink(): Promise<EquipmentCheckLink> {
  await getOrCreateEquipmentCheckLink();
  const sql = getSql();
  const rows = await sql`
    UPDATE equipment_check_link
    SET link_key = ${generateLinkKey()}, key_version = key_version + 1, updated_at = now()
    WHERE id = 1
    RETURNING link_key, key_version
  `;
  const row = rows[0] as Record<string, unknown>;
  return { key: row.link_key as string, keyVersion: row.key_version as number };
}

// Constant-time compare so the public routes don't leak the key through
// response timing.
export async function checkEquipmentCheckLinkKey(key: string): Promise<EquipmentCheckLink | null> {
  if (!key) return null;
  const sql = getSql();
  const rows = await sql`SELECT link_key, key_version FROM equipment_check_link WHERE id = 1`;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  const stored = Buffer.from(row.link_key as string);
  const given = Buffer.from(key);
  if (stored.length !== given.length || !crypto.timingSafeEqual(stored, given)) return null;
  return { key: row.link_key as string, keyVersion: row.key_version as number };
}

// ─── Staff PINs ───────────────────────────────────────────────────────────

// Never carries pin_hash — nothing outside this module ever sees it.
export type EquipmentStaffPinStatus = {
  staffId: string;
  hasPin: boolean;
  setupAllowedUntil: string | null;
  setupOpen: boolean;
  lockedUntil: string | null;
  lastSignInAt: string | null;
};

function rowToPinStatus(row: Record<string, unknown>): EquipmentStaffPinStatus {
  const setupAllowedUntil = toIsoOrNull(row.setup_allowed_until);
  const lockedUntil = toIsoOrNull(row.locked_until);
  const hasPin = Boolean(row.pin_hash);
  return {
    staffId: row.staff_id as string,
    hasPin,
    setupAllowedUntil,
    setupOpen: !hasPin && setupAllowedUntil !== null && new Date(setupAllowedUntil).getTime() > Date.now(),
    lockedUntil: lockedUntil && new Date(lockedUntil).getTime() > Date.now() ? lockedUntil : null,
    lastSignInAt: toIsoOrNull(row.last_sign_in_at),
  };
}

export async function listEquipmentStaffPinStatuses(): Promise<EquipmentStaffPinStatus[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM equipment_staff_pins`;
  return rows.map((r) => rowToPinStatus(r as Record<string, unknown>));
}

export async function getEquipmentStaffPinStatus(staffId: string): Promise<EquipmentStaffPinStatus | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM equipment_staff_pins WHERE staff_id = ${staffId} LIMIT 1`;
  return rows.length ? rowToPinStatus(rows[0] as Record<string, unknown>) : null;
}

// "Allow PIN setup" and "Reset PIN" are the same action: clear any existing
// PIN + lockout and open a fresh 48-hour window for the person to create
// their own.
export async function allowEquipmentPinSetup(staffId: string): Promise<EquipmentStaffPinStatus> {
  const sql = getSql();
  const until = new Date(Date.now() + PIN_SETUP_WINDOW_HOURS * 60 * 60 * 1000).toISOString();
  const rows = await sql`
    INSERT INTO equipment_staff_pins (staff_id, pin_hash, setup_allowed_until, failed_attempts, locked_until, updated_at)
    VALUES (${staffId}, NULL, ${until}, 0, NULL, now())
    ON CONFLICT (staff_id) DO UPDATE
    SET pin_hash = NULL, setup_allowed_until = ${until}, failed_attempts = 0, locked_until = NULL, updated_at = now()
    RETURNING *
  `;
  return rowToPinStatus(rows[0] as Record<string, unknown>);
}

// Only succeeds while the window is open and no PIN exists yet — the
// WHERE clause makes the check-and-set one atomic step, so two tablets
// can't both "create" a PIN for the same person.
export async function createEquipmentStaffPin(staffId: string, pin: string): Promise<boolean> {
  const sql = getSql();
  const pinHash = await hashPin(pin);
  const rows = await sql`
    UPDATE equipment_staff_pins
    SET pin_hash = ${pinHash}, setup_allowed_until = NULL, failed_attempts = 0, locked_until = NULL,
        last_sign_in_at = now(), updated_at = now()
    WHERE staff_id = ${staffId} AND pin_hash IS NULL AND setup_allowed_until > now()
    RETURNING staff_id
  `;
  return rows.length > 0;
}

export type VerifyEquipmentPinResult =
  | { outcome: "ok" }
  | { outcome: "locked"; lockedUntil: string; justLocked: boolean }
  | { outcome: "invalid" }
  | { outcome: "no-pin" };

// Same lockout rule and bookkeeping as Team Hub's verifyTeamHubWorkerPin
// (lib/pinAuth.ts holds the shared numbers).
export async function verifyEquipmentStaffPin(staffId: string, pin: string): Promise<VerifyEquipmentPinResult> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM equipment_staff_pins WHERE staff_id = ${staffId} LIMIT 1`;
  if (rows.length === 0) return { outcome: "no-pin" };
  const row = rows[0] as Record<string, unknown>;
  if (!row.pin_hash) return { outcome: "no-pin" };

  const lockedUntil = toIsoOrNull(row.locked_until);
  if (lockedUntil && new Date(lockedUntil).getTime() > Date.now()) {
    return { outcome: "locked", lockedUntil, justLocked: false };
  }

  const matches = await comparePin(pin, row.pin_hash as string);
  if (!matches) {
    const next = nextFailedPinState(row.failed_attempts as number);
    await sql`
      UPDATE equipment_staff_pins
      SET failed_attempts = ${next.failedAttempts}, locked_until = ${next.lockedUntil}, updated_at = now()
      WHERE staff_id = ${staffId}
    `;
    return next.lockedUntil ? { outcome: "locked", lockedUntil: next.lockedUntil, justLocked: true } : { outcome: "invalid" };
  }

  await sql`
    UPDATE equipment_staff_pins
    SET failed_attempts = 0, locked_until = NULL, last_sign_in_at = now(), updated_at = now()
    WHERE staff_id = ${staffId}
  `;
  return { outcome: "ok" };
}

// ─── Reports ──────────────────────────────────────────────────────────────

export type EquipmentCondition = "good" | "damaged" | "lost";
export const EQUIPMENT_CONDITIONS: EquipmentCondition[] = ["good", "damaged", "lost"];

export type EquipmentReport = {
  id: number;
  staffId: string;
  equipmentId: string;
  condition: EquipmentCondition;
  notesOriginal: string | null;
  notesEnglish: string | null;
  notesLang: string | null;
  photoUrls: string[];
  createdAt: string;
};

function rowToReport(row: Record<string, unknown>): EquipmentReport {
  return {
    id: row.id as number,
    staffId: row.staff_id as string,
    equipmentId: row.equipment_id as string,
    condition: row.condition as EquipmentCondition,
    notesOriginal: (row.notes_original as string | null) ?? null,
    notesEnglish: (row.notes_english as string | null) ?? null,
    notesLang: (row.notes_lang as string | null) ?? null,
    photoUrls: (row.photo_urls as string[] | null) ?? [],
    createdAt: toIso(row.created_at),
  };
}

export async function createEquipmentReport(input: {
  staffId: string;
  equipmentId: string;
  condition: EquipmentCondition;
  notesOriginal: string | null;
}): Promise<EquipmentReport> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO equipment_reports (staff_id, equipment_id, condition, notes_original)
    VALUES (${input.staffId}, ${input.equipmentId}, ${input.condition}, ${input.notesOriginal})
    RETURNING *
  `;
  return rowToReport(rows[0] as Record<string, unknown>);
}

export async function setEquipmentReportPhotos(id: number, photoUrls: string[]): Promise<void> {
  const sql = getSql();
  await sql`UPDATE equipment_reports SET photo_urls = ${photoUrls} WHERE id = ${id}`;
}

export async function setEquipmentReportTranslation(id: number, notesEnglish: string, notesLang: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE equipment_reports SET notes_english = ${notesEnglish}, notes_lang = ${notesLang} WHERE id = ${id}`;
}

const HISTORY_LIMIT = 100;

export async function listEquipmentReportsForEquipment(equipmentId: string): Promise<EquipmentReport[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM equipment_reports WHERE equipment_id = ${equipmentId}
    ORDER BY created_at DESC, id DESC LIMIT ${HISTORY_LIMIT}
  `;
  return rows.map((r) => rowToReport(r as Record<string, unknown>));
}

export async function listEquipmentReportsForStaff(staffId: string): Promise<EquipmentReport[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM equipment_reports WHERE staff_id = ${staffId}
    ORDER BY created_at DESC, id DESC LIMIT ${HISTORY_LIMIT}
  `;
  return rows.map((r) => rowToReport(r as Record<string, unknown>));
}

// Newest tablet report per item — the Equipment admin list uses it for the
// Lost / Needs repair colors (a newer report always wins, so a "good" report
// after a "lost" one clears Lost on its own). Read-only.
export async function listLatestEquipmentReports(): Promise<EquipmentReport[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT ON (equipment_id) * FROM equipment_reports
    ORDER BY equipment_id, created_at DESC, id DESC
  `;
  return rows.map((r) => rowToReport(r as Record<string, unknown>));
}
