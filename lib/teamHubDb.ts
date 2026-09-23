// Server-only Postgres query layer for Team Hub — Phase 0 scope only
// (sites, crews, modules, library reads, crew_items). Mirrors the
// one-file-per-feature convention used in lib/checklistDb.ts.
//
// Never imports from lib/googleSheets.ts (direction 7) — account
// existence is validated via lib/teamHubAccountLookup.ts, the one
// sanctioned choke point. Never stores account name/address/anything
// Sheets-sourced (direction 8) — only account_id/sub_id.
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { getSql } from "@/lib/db";
import { lookupAccountSummary } from "@/lib/teamHubAccountLookup";
import {
  TEAM_HUB_TIMEZONE,
  startOfDayInTimeZone,
  startOfWeekInTimeZone,
  startOfMonthInTimeZone,
  getDateStringInTimeZone,
  getDayOfWeekInTimeZone,
  getMinutesSinceMidnightInTimeZone,
} from "@/lib/teamHubTimezone";

const PIN_BCRYPT_ROUNDS = 10;
export const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function generateCrewToken(): string {
  // Same construction as the archived Site Supply Link token (24 random
  // bytes -> 32 base64url chars, comfortably over the >=32 char
  // requirement, URL-safe with no encoding needed in /team-hub/[token]).
  return crypto.randomBytes(24).toString("base64url");
}

function toIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value ?? "");
}

// ─── hub_sites ───────────────────────────────────────────────────────────

export type TeamHubSite = {
  id: number;
  accountId: string;
  label: string;
  supervisorPhone: string | null;
  active: boolean;
  createdAt: string;
  // Phase 6: night-checklist cutoff alert config. Both null = disabled
  // (the default) — nothing opts a site in automatically.
  nightChecklistCutoffTime: string | null; // "HH:MM", local to TEAM_HUB_TIMEZONE
  nightChecklistServiceDays: number[] | null; // 0=Sun..6=Sat
};

function rowToSite(row: Record<string, unknown>): TeamHubSite {
  return {
    id: row.id as number,
    accountId: row.account_id as string,
    label: row.label as string,
    supervisorPhone: (row.supervisor_phone as string | null) ?? null,
    active: row.active as boolean,
    createdAt: toIso(row.created_at),
    // Postgres TIME comes back as "HH:MM:SS" — trimmed to "HH:MM" for the
    // admin UI's <input type="time">.
    nightChecklistCutoffTime: row.night_checklist_cutoff_time ? String(row.night_checklist_cutoff_time).slice(0, 5) : null,
    nightChecklistServiceDays: (row.night_checklist_service_days as number[] | null) ?? null,
  };
}

export async function getTeamHubSiteByAccountId(accountId: string): Promise<TeamHubSite | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_sites WHERE account_id = ${accountId} LIMIT 1`;
  return rows.length > 0 ? rowToSite(rows[0] as Record<string, unknown>) : null;
}

export async function getTeamHubSiteById(id: number): Promise<TeamHubSite | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_sites WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToSite(rows[0] as Record<string, unknown>) : null;
}

// Validates the account actually exists (via the one sanctioned Sheets
// lookup, lib/teamHubAccountLookup.ts) before creating a site for it —
// catches a typo'd/bad account_id before it's written to Postgres. Throws
// rather than silently creating an orphaned site.
export async function createTeamHubSite(input: {
  accountId: string;
  label: string;
  supervisorPhone: string | null;
}): Promise<TeamHubSite> {
  const account = await lookupAccountSummary(input.accountId);
  if (!account) {
    throw new Error(`No account found for id "${input.accountId}".`);
  }

  const sql = getSql();
  const rows = await sql`
    INSERT INTO hub_sites (account_id, label, supervisor_phone)
    VALUES (${input.accountId}, ${input.label}, ${input.supervisorPhone})
    ON CONFLICT (account_id) DO UPDATE SET label = EXCLUDED.label, supervisor_phone = EXCLUDED.supervisor_phone
    RETURNING *
  `;
  return rowToSite(rows[0] as Record<string, unknown>);
}

export async function updateTeamHubSite(
  id: number,
  input: Partial<{ label: string; supervisorPhone: string | null }>
): Promise<TeamHubSite | null> {
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM hub_sites WHERE id = ${id} LIMIT 1`;
  if (existingRows.length === 0) return null;
  const existing = rowToSite(existingRows[0] as Record<string, unknown>);

  const label = input.label ?? existing.label;
  const supervisorPhone = input.supervisorPhone !== undefined ? input.supervisorPhone : existing.supervisorPhone;

  const rows = await sql`
    UPDATE hub_sites SET label = ${label}, supervisor_phone = ${supervisorPhone} WHERE id = ${id} RETURNING *
  `;
  return rowToSite(rows[0] as Record<string, unknown>);
}

export async function setTeamHubSiteActive(id: number, active: boolean): Promise<TeamHubSite | null> {
  const sql = getSql();
  const rows = await sql`UPDATE hub_sites SET active = ${active} WHERE id = ${id} RETURNING *`;
  return rows.length > 0 ? rowToSite(rows[0] as Record<string, unknown>) : null;
}

// Phase 6: admin sets/clears the night-checklist cutoff alert for a site.
// cutoffTime null or serviceDays an empty/null array both disable the
// alert for this site (getTeamHubSitesWithNightChecklistAlertConfigured
// only returns sites with a non-null cutoff AND at least one service day).
export async function setTeamHubNightChecklistAlertConfig(
  id: number,
  input: { cutoffTime: string | null; serviceDays: number[] | null }
): Promise<TeamHubSite | null> {
  if (input.cutoffTime !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.cutoffTime)) {
    throw new Error('cutoffTime must be "HH:MM" (24-hour) or null.');
  }
  const serviceDays = input.serviceDays && input.serviceDays.length > 0 ? input.serviceDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : null;
  const sql = getSql();
  const rows = await sql`
    UPDATE hub_sites
    SET night_checklist_cutoff_time = ${input.cutoffTime}, night_checklist_service_days = ${serviceDays}
    WHERE id = ${id}
    RETURNING *
  `;
  return rows.length > 0 ? rowToSite(rows[0] as Record<string, unknown>) : null;
}

// ─── hub_crews ───────────────────────────────────────────────────────────

export type TeamHubCrew = {
  id: number;
  siteId: number;
  name: string;
  crewType: "porter" | "night" | "other";
  crewKind: "sub" | "inhouse";
  subId: string | null;
  token: string;
  tokenVersion: number;
  active: boolean;
  revokedAt: string | null;
};

function rowToCrew(row: Record<string, unknown>): TeamHubCrew {
  return {
    id: row.id as number,
    siteId: row.site_id as number,
    name: row.name as string,
    crewType: row.crew_type as TeamHubCrew["crewType"],
    crewKind: row.crew_kind as TeamHubCrew["crewKind"],
    subId: (row.sub_id as string | null) ?? null,
    token: row.token as string,
    tokenVersion: row.token_version as number,
    active: row.active as boolean,
    revokedAt: row.revoked_at ? toIso(row.revoked_at) : null,
  };
}

export async function listTeamHubCrewsForSite(siteId: number): Promise<TeamHubCrew[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_crews WHERE site_id = ${siteId} ORDER BY id ASC`;
  return rows.map((r) => rowToCrew(r as Record<string, unknown>));
}

export async function getTeamHubCrewById(id: number): Promise<TeamHubCrew | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_crews WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToCrew(rows[0] as Record<string, unknown>) : null;
}

// Public lookup for /team-hub/[token] and /api/team-hub/[token]/* — only
// returns a crew when both the crew AND its site are active, so a revoked
// crew or a deactivated Team Hub site both read identically to "no such
// link" (same no-distinguishing-signal reasoning as the archived Site
// Supply Link's getActiveSiteLinkByToken).
export async function getActiveTeamHubCrewByToken(token: string): Promise<{ crew: TeamHubCrew; site: TeamHubSite } | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT hub_crews.*,
      hub_sites.id AS site_id_full, hub_sites.account_id AS site_account_id, hub_sites.label AS site_label,
      hub_sites.supervisor_phone AS site_supervisor_phone, hub_sites.active AS site_active, hub_sites.created_at AS site_created_at,
      hub_sites.night_checklist_cutoff_time AS site_night_checklist_cutoff_time, hub_sites.night_checklist_service_days AS site_night_checklist_service_days
    FROM hub_crews
    JOIN hub_sites ON hub_sites.id = hub_crews.site_id
    WHERE hub_crews.token = ${token} AND hub_crews.active = true AND hub_sites.active = true
    LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0] as Record<string, unknown>;
  return {
    crew: rowToCrew(row),
    site: {
      id: row.site_id_full as number,
      accountId: row.site_account_id as string,
      label: row.site_label as string,
      supervisorPhone: (row.site_supervisor_phone as string | null) ?? null,
      active: row.site_active as boolean,
      createdAt: toIso(row.site_created_at),
      nightChecklistCutoffTime: row.site_night_checklist_cutoff_time ? String(row.site_night_checklist_cutoff_time).slice(0, 5) : null,
      nightChecklistServiceDays: (row.site_night_checklist_service_days as number[] | null) ?? null,
    },
  };
}

export async function createTeamHubCrew(input: {
  siteId: number;
  name: string;
  crewType: TeamHubCrew["crewType"];
  crewKind: TeamHubCrew["crewKind"];
  subId: string | null;
}): Promise<TeamHubCrew> {
  const sql = getSql();
  const token = generateCrewToken();
  const rows = await sql`
    INSERT INTO hub_crews (site_id, name, crew_type, crew_kind, sub_id, token)
    VALUES (${input.siteId}, ${input.name}, ${input.crewType}, ${input.crewKind}, ${input.subId}, ${token})
    RETURNING *
  `;
  return rowToCrew(rows[0] as Record<string, unknown>);
}

export async function setTeamHubCrewActive(id: number, active: boolean): Promise<TeamHubCrew | null> {
  const sql = getSql();
  const rows = active
    ? await sql`UPDATE hub_crews SET active = true, revoked_at = NULL WHERE id = ${id} RETURNING *`
    : await sql`UPDATE hub_crews SET active = false, revoked_at = now() WHERE id = ${id} RETURNING *`;
  return rows.length > 0 ? rowToCrew(rows[0] as Record<string, unknown>) : null;
}

// Bumps BOTH the link token and token_version together — a fresh link
// implies wanting a clean slate, and since Phase 1 worker sessions bind to
// token_version (not to the token string itself, which never appears in a
// session), only bumping token_version actually forces every already-
// logged-in worker to re-authenticate. Regenerating token alone would
// break the old /team-hub/[token] link but NOT sign anyone out.
export async function regenerateTeamHubCrewToken(id: number): Promise<TeamHubCrew | null> {
  const sql = getSql();
  const token = generateCrewToken();
  const rows = await sql`
    UPDATE hub_crews SET token = ${token}, token_version = token_version + 1 WHERE id = ${id} RETURNING *
  `;
  return rows.length > 0 ? rowToCrew(rows[0] as Record<string, unknown>) : null;
}

// ─── hub_crew_modules ────────────────────────────────────────────────────

export type TeamHubModule = "checklist" | "rounds" | "handoff" | "requests" | "supplies" | "issues";
export const TEAM_HUB_MODULES: TeamHubModule[] = ["checklist", "rounds", "handoff", "requests", "supplies", "issues"];

export async function getTeamHubCrewModules(crewId: number): Promise<Record<TeamHubModule, boolean>> {
  const sql = getSql();
  const rows = await sql`SELECT module, enabled FROM hub_crew_modules WHERE crew_id = ${crewId}`;
  const enabledByModule = new Map(rows.map((r) => [(r as Record<string, unknown>).module as string, (r as Record<string, unknown>).enabled as boolean]));
  const result = {} as Record<TeamHubModule, boolean>;
  // Named moduleName, not module — `module` is a reserved/special
  // identifier Next.js's ESLint config warns on (shadows the CommonJS
  // module global some tooling relies on).
  for (const moduleName of TEAM_HUB_MODULES) {
    result[moduleName] = enabledByModule.get(moduleName) ?? false;
  }
  return result;
}

export async function setTeamHubCrewModules(crewId: number, modules: Partial<Record<TeamHubModule, boolean>>): Promise<void> {
  const sql = getSql();
  for (const [moduleName, enabled] of Object.entries(modules)) {
    if (enabled === undefined) continue;
    await sql`
      INSERT INTO hub_crew_modules (crew_id, module, enabled) VALUES (${crewId}, ${moduleName}, ${enabled})
      ON CONFLICT (crew_id, module) DO UPDATE SET enabled = EXCLUDED.enabled
    `;
  }
}

// ─── Library reads (Phase 0: read-only — full editors are Phase 6) ───────

export type ChecklistLibraryItem = {
  id: number;
  area: string;
  text: string;
  defaultFrequency: "visit" | "weekly" | "monthly";
  isNote: boolean;
  active: boolean;
};

export async function listChecklistLibrary(activeOnly: boolean): Promise<ChecklistLibraryItem[]> {
  const sql = getSql();
  const rows = activeOnly
    ? await sql`SELECT * FROM hub_checklist_library WHERE active = true ORDER BY area ASC, id ASC`
    : await sql`SELECT * FROM hub_checklist_library ORDER BY area ASC, id ASC`;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as number,
      area: row.area as string,
      text: row.text as string,
      defaultFrequency: row.default_frequency as ChecklistLibraryItem["defaultFrequency"],
      isNote: row.is_note as boolean,
      active: row.active as boolean,
    };
  });
}

// Phase 6: admin CRUD for the company-wide checklist library (Phase 0 only
// read it). No delete — items can be tapped in an existing crew_item or
// referenced by past run_items, so "remove" is always setActive(false),
// same convention hub_sites/hub_crews/hub_workers already use.
export async function createChecklistLibraryItem(input: {
  area: string;
  text: string;
  defaultFrequency: ChecklistLibraryItem["defaultFrequency"];
  isNote: boolean;
}): Promise<ChecklistLibraryItem> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO hub_checklist_library (area, text, default_frequency, is_note)
    VALUES (${input.area}, ${input.text}, ${input.defaultFrequency}, ${input.isNote})
    RETURNING *
  `;
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row.id as number,
    area: row.area as string,
    text: row.text as string,
    defaultFrequency: row.default_frequency as ChecklistLibraryItem["defaultFrequency"],
    isNote: row.is_note as boolean,
    active: row.active as boolean,
  };
}

export async function updateChecklistLibraryItem(
  id: number,
  input: Partial<{ area: string; text: string; defaultFrequency: ChecklistLibraryItem["defaultFrequency"]; isNote: boolean }>
): Promise<ChecklistLibraryItem | null> {
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM hub_checklist_library WHERE id = ${id} LIMIT 1`;
  if (existingRows.length === 0) return null;
  const existing = existingRows[0] as Record<string, unknown>;

  const area = input.area ?? (existing.area as string);
  const text = input.text ?? (existing.text as string);
  const defaultFrequency = input.defaultFrequency ?? (existing.default_frequency as ChecklistLibraryItem["defaultFrequency"]);
  const isNote = input.isNote ?? (existing.is_note as boolean);

  const rows = await sql`
    UPDATE hub_checklist_library
    SET area = ${area}, text = ${text}, default_frequency = ${defaultFrequency}, is_note = ${isNote}
    WHERE id = ${id}
    RETURNING *
  `;
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row.id as number,
    area: row.area as string,
    text: row.text as string,
    defaultFrequency: row.default_frequency as ChecklistLibraryItem["defaultFrequency"],
    isNote: row.is_note as boolean,
    active: row.active as boolean,
  };
}

export async function setChecklistLibraryItemActive(id: number, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE hub_checklist_library SET active = ${active} WHERE id = ${id}`;
}

export type RoundLibraryItem = { id: number; name: string; defaultIntervalMinutes: number; active: boolean };

export async function listRoundLibrary(activeOnly: boolean): Promise<RoundLibraryItem[]> {
  const sql = getSql();
  const rows = activeOnly
    ? await sql`SELECT * FROM hub_round_library WHERE active = true ORDER BY name ASC`
    : await sql`SELECT * FROM hub_round_library ORDER BY name ASC`;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as number,
      name: row.name as string,
      defaultIntervalMinutes: row.default_interval_minutes as number,
      active: row.active as boolean,
    };
  });
}

export async function createRoundLibraryItem(input: { name: string; defaultIntervalMinutes: number }): Promise<RoundLibraryItem> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO hub_round_library (name, default_interval_minutes) VALUES (${input.name}, ${input.defaultIntervalMinutes}) RETURNING *
  `;
  const row = rows[0] as Record<string, unknown>;
  return { id: row.id as number, name: row.name as string, defaultIntervalMinutes: row.default_interval_minutes as number, active: row.active as boolean };
}

export async function updateRoundLibraryItem(id: number, input: Partial<{ name: string; defaultIntervalMinutes: number }>): Promise<RoundLibraryItem | null> {
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM hub_round_library WHERE id = ${id} LIMIT 1`;
  if (existingRows.length === 0) return null;
  const existing = existingRows[0] as Record<string, unknown>;
  const name = input.name ?? (existing.name as string);
  const defaultIntervalMinutes = input.defaultIntervalMinutes ?? (existing.default_interval_minutes as number);
  const rows = await sql`
    UPDATE hub_round_library SET name = ${name}, default_interval_minutes = ${defaultIntervalMinutes} WHERE id = ${id} RETURNING *
  `;
  const row = rows[0] as Record<string, unknown>;
  return { id: row.id as number, name: row.name as string, defaultIntervalMinutes: row.default_interval_minutes as number, active: row.active as boolean };
}

export async function setRoundLibraryItemActive(id: number, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE hub_round_library SET active = ${active} WHERE id = ${id}`;
}

export type SupplyLibraryItem = {
  id: number;
  name: string;
  unit: string;
  sortOrder: number;
  active: boolean;
  equipmentPartId: string | null;
};

export async function listSupplyItemsLibrary(activeOnly: boolean): Promise<SupplyLibraryItem[]> {
  const sql = getSql();
  const rows = activeOnly
    ? await sql`SELECT * FROM supply_items WHERE active = true ORDER BY sort_order ASC, name ASC`
    : await sql`SELECT * FROM supply_items ORDER BY sort_order ASC, name ASC`;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as number,
      name: row.name as string,
      unit: row.unit as string,
      sortOrder: row.sort_order as number,
      active: row.active as boolean,
      equipmentPartId: (row.equipment_part_id as string | null) ?? null,
    };
  });
}

function rowToSupplyLibraryItem(row: Record<string, unknown>): SupplyLibraryItem {
  return {
    id: row.id as number,
    name: row.name as string,
    unit: row.unit as string,
    sortOrder: row.sort_order as number,
    active: row.active as boolean,
    equipmentPartId: (row.equipment_part_id as string | null) ?? null,
  };
}

// Company-wide Team Hub supply catalog (this table, unrenamed per §2 of the
// spec) — NOT the Sheets-backed Equipment/Supplies inventory app/supplies
// manages; equipmentPartId is the only link between the two, and it stays a
// plain TEXT reference (never an FK — see the CREATE TABLE comment).
export async function createSupplyLibraryItem(input: { name: string; unit: string; sortOrder: number; equipmentPartId: string | null }): Promise<SupplyLibraryItem> {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO supply_items (name, unit, sort_order, equipment_part_id)
    VALUES (${input.name}, ${input.unit}, ${input.sortOrder}, ${input.equipmentPartId})
    RETURNING *
  `;
  return rowToSupplyLibraryItem(rows[0] as Record<string, unknown>);
}

export async function updateSupplyLibraryItem(
  id: number,
  input: Partial<{ name: string; unit: string; sortOrder: number; equipmentPartId: string | null }>
): Promise<SupplyLibraryItem | null> {
  const sql = getSql();
  const existingRows = await sql`SELECT * FROM supply_items WHERE id = ${id} LIMIT 1`;
  if (existingRows.length === 0) return null;
  const existing = existingRows[0] as Record<string, unknown>;
  const name = input.name ?? (existing.name as string);
  const unit = input.unit ?? (existing.unit as string);
  const sortOrder = input.sortOrder ?? (existing.sort_order as number);
  const equipmentPartId = input.equipmentPartId !== undefined ? input.equipmentPartId : ((existing.equipment_part_id as string | null) ?? null);
  const rows = await sql`
    UPDATE supply_items SET name = ${name}, unit = ${unit}, sort_order = ${sortOrder}, equipment_part_id = ${equipmentPartId}
    WHERE id = ${id}
    RETURNING *
  `;
  return rowToSupplyLibraryItem(rows[0] as Record<string, unknown>);
}

export async function setSupplyLibraryItemActive(id: number, active: boolean): Promise<void> {
  const sql = getSql();
  await sql`UPDATE supply_items SET active = ${active} WHERE id = ${id}`;
}

// ─── hub_crew_items (visibility picker) ─────────────────────────────────

export type TeamHubCrewItem = {
  id: number;
  crewId: number;
  itemType: "checklist" | "round" | "supply";
  itemId: number;
  enabled: boolean;
  frequencyOverride: "visit" | "weekly" | "monthly" | null;
  instanceLabel: string | null;
  sortOrder: number;
};

function rowToCrewItem(row: Record<string, unknown>): TeamHubCrewItem {
  return {
    id: row.id as number,
    crewId: row.crew_id as number,
    itemType: row.item_type as TeamHubCrewItem["itemType"],
    itemId: row.item_id as number,
    enabled: row.enabled as boolean,
    frequencyOverride: (row.frequency_override as TeamHubCrewItem["frequencyOverride"]) ?? null,
    instanceLabel: (row.instance_label as string | null) ?? null,
    sortOrder: row.sort_order as number,
  };
}

export async function listTeamHubCrewItems(crewId: number): Promise<TeamHubCrewItem[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_crew_items WHERE crew_id = ${crewId} ORDER BY sort_order ASC, id ASC`;
  return rows.map((r) => rowToCrewItem(r as Record<string, unknown>));
}

export type SetCrewItemInput = {
  itemType: TeamHubCrewItem["itemType"];
  itemId: number;
  enabled: boolean;
  frequencyOverride?: TeamHubCrewItem["frequencyOverride"];
  instanceLabel?: string | null;
  sortOrder: number;
};

// Whole-list replace for one crew (delete-then-insert), same convention as
// the archived Site Supply Link's setSiteLinkAllowedItems — simplest
// correct behavior for an admin-driven checkbox picker with drag-to-reorder,
// at the cost of not being a single atomic statement across the two calls.
export async function setTeamHubCrewItems(crewId: number, items: SetCrewItemInput[]): Promise<void> {
  const sql = getSql();
  await sql`DELETE FROM hub_crew_items WHERE crew_id = ${crewId}`;
  for (const item of items) {
    await sql`
      INSERT INTO hub_crew_items (crew_id, item_type, item_id, enabled, frequency_override, instance_label, sort_order)
      VALUES (
        ${crewId}, ${item.itemType}, ${item.itemId}, ${item.enabled},
        ${item.frequencyOverride ?? null}, ${item.instanceLabel ?? null}, ${item.sortOrder}
      )
    `;
  }
}

// ─── hub_workers (Phase 1: PIN login) ───────────────────────────────────

export type TeamHubWorker = {
  id: number;
  crewId: number;
  firstName: string;
  active: boolean;
  failedAttempts: number;
  lockedUntil: string | null;
  lastSignInAt: string | null;
  lastDevice: string | null;
};

function rowToWorker(row: Record<string, unknown>): TeamHubWorker {
  return {
    id: row.id as number,
    crewId: row.crew_id as number,
    firstName: row.first_name as string,
    active: row.active as boolean,
    failedAttempts: row.failed_attempts as number,
    lockedUntil: row.locked_until ? toIso(row.locked_until) : null,
    lastSignInAt: row.last_sign_in_at ? toIso(row.last_sign_in_at) : null,
    lastDevice: (row.last_device as string | null) ?? null,
  };
}

export async function listTeamHubWorkersForCrew(crewId: number): Promise<TeamHubWorker[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_workers WHERE crew_id = ${crewId} ORDER BY first_name ASC, id ASC`;
  return rows.map((r) => rowToWorker(r as Record<string, unknown>));
}

// Public-facing roster (worker picker on the PIN login screen) — id + name
// only, active workers of an active crew only. Never include pin_hash,
// failed_attempts, or lock state here; those stay admin- and login-route-only.
export async function listActiveTeamHubWorkerNames(crewId: number): Promise<{ id: number; firstName: string }[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT id, first_name FROM hub_workers WHERE crew_id = ${crewId} AND active = true ORDER BY first_name ASC, id ASC
  `;
  return rows.map((r) => ({ id: (r as Record<string, unknown>).id as number, firstName: (r as Record<string, unknown>).first_name as string }));
}

export async function getTeamHubWorkerById(id: number): Promise<TeamHubWorker | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_workers WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToWorker(rows[0] as Record<string, unknown>) : null;
}

function isPinFormatValid(pin: string): boolean {
  return /^\d{4,6}$/.test(pin);
}

export async function createTeamHubWorker(input: { crewId: number; firstName: string; pin: string }): Promise<TeamHubWorker> {
  if (!isPinFormatValid(input.pin)) {
    throw new Error("PIN must be 4-6 digits.");
  }
  const pinHash = await bcrypt.hash(input.pin, PIN_BCRYPT_ROUNDS);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO hub_workers (crew_id, first_name, pin_hash) VALUES (${input.crewId}, ${input.firstName}, ${pinHash})
    RETURNING *
  `;
  return rowToWorker(rows[0] as Record<string, unknown>);
}

export async function renameTeamHubWorker(id: number, firstName: string): Promise<TeamHubWorker | null> {
  const sql = getSql();
  const rows = await sql`UPDATE hub_workers SET first_name = ${firstName} WHERE id = ${id} RETURNING *`;
  return rows.length > 0 ? rowToWorker(rows[0] as Record<string, unknown>) : null;
}

export async function setTeamHubWorkerActive(id: number, active: boolean): Promise<TeamHubWorker | null> {
  const sql = getSql();
  const rows = await sql`UPDATE hub_workers SET active = ${active} WHERE id = ${id} RETURNING *`;
  return rows.length > 0 ? rowToWorker(rows[0] as Record<string, unknown>) : null;
}

// Admin-driven reset: also clears any existing lockout, since an admin
// handing out a fresh PIN implies the worker should be able to sign in
// immediately, not wait out a lock from PIN-guessing on the old one.
export async function resetTeamHubWorkerPin(id: number, pin: string): Promise<TeamHubWorker | null> {
  if (!isPinFormatValid(pin)) {
    throw new Error("PIN must be 4-6 digits.");
  }
  const pinHash = await bcrypt.hash(pin, PIN_BCRYPT_ROUNDS);
  const sql = getSql();
  const rows = await sql`
    UPDATE hub_workers SET pin_hash = ${pinHash}, failed_attempts = 0, locked_until = NULL WHERE id = ${id} RETURNING *
  `;
  return rows.length > 0 ? rowToWorker(rows[0] as Record<string, unknown>) : null;
}

// ─── Enabled item lists (Phase 2: crew-facing checklist + rounds) ──────────
// Joins hub_crew_items against the specific library table for its item_type
// — item_id is intentionally not an FK (see hub_crew_items comment above),
// so the join target is chosen by item_type here rather than by Postgres.

export type TeamHubChecklistCrewItem = {
  crewItemId: number;
  sortOrder: number;
  instanceLabel: string | null;
  area: string;
  text: string;
  isNote: boolean;
  frequency: "visit" | "weekly" | "monthly";
};

export async function listEnabledTeamHubChecklistItemsForCrew(crewId: number): Promise<TeamHubChecklistCrewItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT ci.id AS crew_item_id, ci.sort_order, ci.instance_label, ci.frequency_override,
           cl.area, cl.text, cl.is_note, cl.default_frequency
    FROM hub_crew_items ci
    JOIN hub_checklist_library cl ON cl.id = ci.item_id
    WHERE ci.crew_id = ${crewId} AND ci.item_type = 'checklist' AND ci.enabled = true
    ORDER BY ci.sort_order ASC, ci.id ASC
  `;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      crewItemId: row.crew_item_id as number,
      sortOrder: row.sort_order as number,
      instanceLabel: (row.instance_label as string | null) ?? null,
      area: row.area as string,
      text: row.text as string,
      isNote: row.is_note as boolean,
      frequency: ((row.frequency_override as string | null) ?? (row.default_frequency as string)) as TeamHubChecklistCrewItem["frequency"],
    };
  });
}

// What a run actually shows: all 'visit' items and notes every time, but
// 'weekly'/'monthly' items only once they're due again — i.e. not yet
// completed (any status counts: done/na/problem) in a *submitted* run
// since the current week/month started, per TEAM_HUB_TIMEZONE. An item
// tapped earlier in the SAME still-open run doesn't count as "done" here
// (only submitted runs do), so it can't disappear out from under the
// worker mid-run.
export async function listDueTeamHubChecklistItemsForCrew(crewId: number, atInstant: Date = new Date()): Promise<TeamHubChecklistCrewItem[]> {
  const items = await listEnabledTeamHubChecklistItemsForCrew(crewId);
  const periodic = items.filter((item) => !item.isNote && item.frequency !== "visit");
  if (periodic.length === 0) return items;

  const sql = getSql();
  const rows = await sql`
    SELECT ri.crew_item_id, MAX(r.submitted_at) AS last_done
    FROM hub_checklist_run_items ri
    JOIN hub_checklist_runs r ON r.id = ri.run_id
    JOIN hub_crew_items ci ON ci.id = ri.crew_item_id
    WHERE ci.crew_id = ${crewId} AND r.submitted_at IS NOT NULL
    GROUP BY ri.crew_item_id
  `;
  const lastDoneByItem = new Map<number, Date>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    lastDoneByItem.set(row.crew_item_id as number, new Date(toIso(row.last_done)));
  }

  const weekStart = startOfWeekInTimeZone(atInstant, TEAM_HUB_TIMEZONE);
  const monthStart = startOfMonthInTimeZone(atInstant, TEAM_HUB_TIMEZONE);

  return items.filter((item) => {
    if (item.isNote || item.frequency === "visit") return true;
    const lastDone = lastDoneByItem.get(item.crewItemId);
    if (!lastDone) return true;
    const boundary = item.frequency === "weekly" ? weekStart : monthStart;
    return lastDone.getTime() < boundary.getTime();
  });
}

export type TeamHubRoundCrewItem = {
  crewItemId: number;
  sortOrder: number;
  instanceLabel: string | null;
  name: string;
  intervalMinutes: number;
};

export async function listEnabledTeamHubRoundItemsForCrew(crewId: number): Promise<TeamHubRoundCrewItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT ci.id AS crew_item_id, ci.sort_order, ci.instance_label,
           rl.name, rl.default_interval_minutes
    FROM hub_crew_items ci
    JOIN hub_round_library rl ON rl.id = ci.item_id
    WHERE ci.crew_id = ${crewId} AND ci.item_type = 'round' AND ci.enabled = true
    ORDER BY ci.sort_order ASC, ci.id ASC
  `;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      crewItemId: row.crew_item_id as number,
      sortOrder: row.sort_order as number,
      instanceLabel: (row.instance_label as string | null) ?? null,
      name: row.name as string,
      intervalMinutes: row.default_interval_minutes as number,
    };
  });
}

export type TeamHubSupplyCrewItem = {
  crewItemId: number;
  sortOrder: number;
  instanceLabel: string | null;
  itemId: number;
  name: string;
  unit: string;
  equipmentPartId: string | null;
};

export async function listEnabledTeamHubSupplyItemsForCrew(crewId: number): Promise<TeamHubSupplyCrewItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT ci.id AS crew_item_id, ci.sort_order, ci.instance_label,
           si.id AS item_id, si.name, si.unit, si.equipment_part_id
    FROM hub_crew_items ci
    JOIN supply_items si ON si.id = ci.item_id
    WHERE ci.crew_id = ${crewId} AND ci.item_type = 'supply' AND ci.enabled = true
    ORDER BY ci.sort_order ASC, ci.id ASC
  `;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      crewItemId: row.crew_item_id as number,
      sortOrder: row.sort_order as number,
      instanceLabel: (row.instance_label as string | null) ?? null,
      itemId: row.item_id as number,
      name: row.name as string,
      unit: row.unit as string,
      equipmentPartId: (row.equipment_part_id as string | null) ?? null,
    };
  });
}

// Shared crew-item ownership check used by both the checklist run-item
// upsert and the round check-in — item_id isn't an FK (see above), so this
// is the only thing standing between a tampered crewItemId in a request
// body and writing a row against another crew's item. Returns false rather
// than throwing so callers can produce their own 400/404 shape.
async function isEnabledTeamHubCrewItem(crewId: number, crewItemId: number, itemType: "checklist" | "round"): Promise<boolean> {
  const sql = getSql();
  const rows = await sql`
    SELECT 1 FROM hub_crew_items WHERE id = ${crewItemId} AND crew_id = ${crewId} AND item_type = ${itemType} AND enabled = true LIMIT 1
  `;
  return rows.length > 0;
}

// ─── hub_checklist_runs / hub_checklist_run_items (Phase 2) ───────────────
// One "run" is one pass through the crew's checklist (e.g. one visit or
// shift) — open (submitted_at IS NULL) until the crew taps Submit. Only one
// open run per crew at a time; tapping an item autosaves a row immediately
// rather than waiting for Submit, so progress survives a dropped connection
// or a worker switch mid-run.

export type TeamHubChecklistRun = {
  id: number;
  crewId: number;
  startedAt: string;
  submittedAt: string | null;
  startedByWorkerId: number | null;
};

function rowToChecklistRun(row: Record<string, unknown>): TeamHubChecklistRun {
  return {
    id: row.id as number,
    crewId: row.crew_id as number,
    startedAt: toIso(row.started_at),
    submittedAt: row.submitted_at ? toIso(row.submitted_at) : null,
    startedByWorkerId: (row.started_by_worker_id as number | null) ?? null,
  };
}

export async function getOpenTeamHubChecklistRun(crewId: number): Promise<TeamHubChecklistRun | null> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM hub_checklist_runs WHERE crew_id = ${crewId} AND submitted_at IS NULL ORDER BY started_at DESC LIMIT 1
  `;
  return rows.length > 0 ? rowToChecklistRun(rows[0] as Record<string, unknown>) : null;
}

// Idempotent: returns the existing open run rather than starting a second
// one if the crew already has one going (e.g. a second worker opens the
// checklist tile mid-shift).
export async function startTeamHubChecklistRun(crewId: number, workerId: number): Promise<TeamHubChecklistRun> {
  const existing = await getOpenTeamHubChecklistRun(crewId);
  if (existing) return existing;
  const sql = getSql();
  const rows = await sql`
    INSERT INTO hub_checklist_runs (crew_id, started_by_worker_id) VALUES (${crewId}, ${workerId}) RETURNING *
  `;
  return rowToChecklistRun(rows[0] as Record<string, unknown>);
}

export type TeamHubChecklistRunItem = {
  id: number;
  runId: number;
  crewItemId: number;
  status: "done" | "na" | "problem";
  note: string;
  workerId: number | null;
  workerFirstName: string | null;
  updatedAt: string;
};

export async function listTeamHubChecklistRunItems(runId: number): Promise<TeamHubChecklistRunItem[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT ri.*, w.first_name AS worker_first_name
    FROM hub_checklist_run_items ri
    LEFT JOIN hub_workers w ON w.id = ri.worker_id
    WHERE ri.run_id = ${runId}
  `;
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id as number,
      runId: row.run_id as number,
      crewItemId: row.crew_item_id as number,
      status: row.status as TeamHubChecklistRunItem["status"],
      note: row.note as string,
      workerId: (row.worker_id as number | null) ?? null,
      workerFirstName: (row.worker_first_name as string | null) ?? null,
      updatedAt: toIso(row.updated_at),
    };
  });
}

// Tap-to-complete autosave — one row per (run, crew_item), overwritten on
// re-tap (e.g. Done -> Problem). Throws if the run is already submitted or
// crewItemId isn't an enabled checklist item on this crew, so a route can
// turn either into a plain 400.
export async function upsertTeamHubChecklistRunItem(input: {
  crewId: number;
  runId: number;
  crewItemId: number;
  workerId: number;
  status: TeamHubChecklistRunItem["status"];
  note: string;
}): Promise<TeamHubChecklistRunItem> {
  const validItem = await isEnabledTeamHubCrewItem(input.crewId, input.crewItemId, "checklist");
  if (!validItem) {
    throw new Error("Checklist item not found for this crew.");
  }
  const sql = getSql();
  const runRows = await sql`SELECT submitted_at FROM hub_checklist_runs WHERE id = ${input.runId} AND crew_id = ${input.crewId} LIMIT 1`;
  if (runRows.length === 0) {
    throw new Error("Checklist run not found.");
  }
  if ((runRows[0] as Record<string, unknown>).submitted_at) {
    throw new Error("This checklist has already been submitted.");
  }

  const rows = await sql`
    INSERT INTO hub_checklist_run_items (run_id, crew_item_id, status, note, worker_id, updated_at)
    VALUES (${input.runId}, ${input.crewItemId}, ${input.status}, ${input.note}, ${input.workerId}, now())
    ON CONFLICT (run_id, crew_item_id)
    DO UPDATE SET status = EXCLUDED.status, note = EXCLUDED.note, worker_id = EXCLUDED.worker_id, updated_at = now()
    RETURNING *
  `;
  const row = rows[0] as Record<string, unknown>;
  return {
    id: row.id as number,
    runId: row.run_id as number,
    crewItemId: row.crew_item_id as number,
    status: row.status as TeamHubChecklistRunItem["status"],
    note: row.note as string,
    workerId: (row.worker_id as number | null) ?? null,
    workerFirstName: null,
    updatedAt: toIso(row.updated_at),
  };
}

// Idempotent — submitting an already-submitted run just returns it as-is
// rather than erroring, so a double-tap or a retried request can't fail.
export async function submitTeamHubChecklistRun(crewId: number, runId: number): Promise<TeamHubChecklistRun | null> {
  const sql = getSql();
  const rows = await sql`
    UPDATE hub_checklist_runs SET submitted_at = now()
    WHERE id = ${runId} AND crew_id = ${crewId} AND submitted_at IS NULL
    RETURNING *
  `;
  if (rows.length > 0) return rowToChecklistRun(rows[0] as Record<string, unknown>);
  const existing = await sql`SELECT * FROM hub_checklist_runs WHERE id = ${runId} AND crew_id = ${crewId} LIMIT 1`;
  return existing.length > 0 ? rowToChecklistRun(existing[0] as Record<string, unknown>) : null;
}

// Simplicity pass: tap = done, tap again = undo — there's no "not done"
// value in hub_checklist_run_items.status's CHECK constraint (done/na/
// problem only), so "undo" removes the row entirely rather than writing a
// new status. Scoped to the crew's open run the same way the upsert is.
export async function deleteTeamHubChecklistRunItem(crewId: number, runId: number, crewItemId: number): Promise<void> {
  const sql = getSql();
  const runRows = await sql`SELECT submitted_at FROM hub_checklist_runs WHERE id = ${runId} AND crew_id = ${crewId} LIMIT 1`;
  if (runRows.length === 0) {
    throw new Error("Checklist run not found.");
  }
  if ((runRows[0] as Record<string, unknown>).submitted_at) {
    throw new Error("This checklist has already been submitted.");
  }
  await sql`DELETE FROM hub_checklist_run_items WHERE run_id = ${runId} AND crew_item_id = ${crewItemId}`;
}

export type TeamHubChecklistRunSummary = { submittedAt: string; doneCount: number; totalCount: number };

// Admin "status line" (simplicity pass) — the most recently SUBMITTED run
// for a crew, with how many items got tapped vs. how many checklist items
// are enabled for the crew right now. totalCount is the crew's CURRENT
// enabled-item count, not a historical snapshot of what the run actually
// offered — a deliberate simplification (admins rarely reshuffle the
// checklist mid-week, and storing a historical total would need a new
// column) flagged in docs/team-hub-spec.md.
export async function getLastSubmittedTeamHubChecklistRunSummary(crewId: number): Promise<TeamHubChecklistRunSummary | null> {
  const sql = getSql();
  const runRows = await sql`
    SELECT id, submitted_at FROM hub_checklist_runs
    WHERE crew_id = ${crewId} AND submitted_at IS NOT NULL
    ORDER BY submitted_at DESC LIMIT 1
  `;
  if (runRows.length === 0) return null;
  const run = runRows[0] as Record<string, unknown>;

  const [doneRows, totalRows] = await Promise.all([
    sql`SELECT COUNT(*)::int AS n FROM hub_checklist_run_items WHERE run_id = ${run.id as number}`,
    sql`SELECT COUNT(*)::int AS n FROM hub_crew_items WHERE crew_id = ${crewId} AND item_type = 'checklist' AND enabled = true`,
  ]);

  return {
    submittedAt: toIso(run.submitted_at),
    doneCount: (doneRows[0] as Record<string, unknown>).n as number,
    totalCount: (totalRows[0] as Record<string, unknown>).n as number,
  };
}

// ─── hub_round_checks (Phase 2) ─────────────────────────────────────────
// No "run" concept for rounds — a round recurs all shift (e.g. "restrooms
// every 2 hours"), so each check-in is just a standalone timestamped row.
// The crew view shows, per round, the most recent check-in *today* (per
// TEAM_HUB_TIMEZONE) and how long ago it was against
// default_interval_minutes — a check-in from a previous calendar day
// doesn't count, so a round nobody has walked yet today reads as
// "Not checked today," not as a stale multi-day-old timestamp.

export type TeamHubRoundCheck = {
  crewItemId: number;
  checkedAt: string;
  note: string;
  workerFirstName: string | null;
};

export async function getLatestTeamHubRoundChecksForCrew(crewId: number, atInstant: Date = new Date()): Promise<Map<number, TeamHubRoundCheck>> {
  const todayStart = startOfDayInTimeZone(atInstant, TEAM_HUB_TIMEZONE);
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT ON (rc.crew_item_id) rc.crew_item_id, rc.checked_at, rc.note, w.first_name AS worker_first_name
    FROM hub_round_checks rc
    JOIN hub_crew_items ci ON ci.id = rc.crew_item_id
    LEFT JOIN hub_workers w ON w.id = rc.worker_id
    WHERE ci.crew_id = ${crewId} AND rc.checked_at >= ${todayStart.toISOString()}
    ORDER BY rc.crew_item_id, rc.checked_at DESC
  `;
  const map = new Map<number, TeamHubRoundCheck>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    map.set(row.crew_item_id as number, {
      crewItemId: row.crew_item_id as number,
      checkedAt: toIso(row.checked_at),
      note: (row.note as string) ?? "",
      workerFirstName: (row.worker_first_name as string | null) ?? null,
    });
  }
  return map;
}

export async function recordTeamHubRoundCheck(input: {
  crewId: number;
  crewItemId: number;
  workerId: number;
  note: string;
}): Promise<TeamHubRoundCheck> {
  const validItem = await isEnabledTeamHubCrewItem(input.crewId, input.crewItemId, "round");
  if (!validItem) {
    throw new Error("Round not found for this crew.");
  }
  const sql = getSql();
  const rows = await sql`
    INSERT INTO hub_round_checks (crew_item_id, worker_id, note) VALUES (${input.crewItemId}, ${input.workerId}, ${input.note}) RETURNING *
  `;
  const row = rows[0] as Record<string, unknown>;
  return {
    crewItemId: row.crew_item_id as number,
    checkedAt: toIso(row.checked_at),
    note: (row.note as string) ?? "",
    workerFirstName: null,
  };
}

// ─── hub_issues (Phase 4: "Report a problem") ──────────────────────────────
// The simplicity pass added a minimal note-only version of this ahead of
// schedule (category always 'other', no photo) because the checklist screen
// needed a real, always-visible "Report a problem" action rather than a
// dead button. Phase 4 replaces it with the full version: a real category,
// photos (via hub_photos, parent_type='issue'), and admin status/complaint
// linkage.
//
// "Links the problem to the current run" (Part 2): reportTeamHubIssue looks
// up the crew's own currently-open checklist run (if any) and stores its id
// in `run_id` — a separate, whole-run-level column from `run_item_id`
// (which points at one specific checklist item's run_item row and always
// stays null here; there's no single item to anchor a whole-run problem
// report to since the simplicity pass removed the per-item Problem status).
// This is server-determined, not client-supplied: the report is reached
// two ways (the checklist screen's always-visible button, and the Today
// "issues" tile directly), and either one links automatically whenever the
// crew happens to have an open run at report time — simpler and more
// robust than threading a runId through the client/route contract, and
// semantically the same thing ("this happened during this run").

export const TEAM_HUB_ISSUE_CATEGORIES = ["restroom", "trash", "damage", "leak", "access", "supplies", "safety", "other"] as const;
export type TeamHubIssueCategory = (typeof TEAM_HUB_ISSUE_CATEGORIES)[number];

export type TeamHubIssue = {
  id: number;
  siteId: number;
  crewId: number;
  workerId: number | null;
  workerFirstName: string | null;
  category: TeamHubIssueCategory;
  note: string;
  // SHARED TRANSLATION (docs/team-hub-spec.md §12) — both null until the
  // async translation (fired from the route, after the row is created)
  // completes; null also means "translation failed," not "empty."
  noteEnglish: string | null;
  noteLanguage: string | null;
  status: "open" | "resolved";
  runId: number | null;
  complaintId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  photos: string[];
};

function rowToIssue(row: Record<string, unknown>): TeamHubIssue {
  return {
    id: row.id as number,
    siteId: row.site_id as number,
    crewId: row.crew_id as number,
    workerId: (row.worker_id as number | null) ?? null,
    workerFirstName: (row.worker_first_name as string | null) ?? null,
    category: row.category as TeamHubIssueCategory,
    note: (row.note as string) ?? "",
    noteEnglish: (row.note_english as string | null) ?? null,
    noteLanguage: (row.note_language as string | null) ?? null,
    status: row.status as TeamHubIssue["status"],
    runId: (row.run_id as number | null) ?? null,
    complaintId: (row.complaint_id as string | null) ?? null,
    createdAt: toIso(row.created_at),
    resolvedAt: row.resolved_at ? toIso(row.resolved_at) : null,
    photos: [],
  };
}

export async function reportTeamHubIssue(input: {
  siteId: number;
  crewId: number;
  workerId: number;
  category: TeamHubIssueCategory;
  note: string;
}): Promise<TeamHubIssue> {
  if (!TEAM_HUB_ISSUE_CATEGORIES.includes(input.category)) {
    throw new Error("Invalid category.");
  }
  const note = input.note.trim().slice(0, 2000);
  const openRun = await getOpenTeamHubChecklistRun(input.crewId);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO hub_issues (site_id, crew_id, worker_id, category, note, run_id)
    VALUES (${input.siteId}, ${input.crewId}, ${input.workerId}, ${input.category}, ${note}, ${openRun?.id ?? null})
    RETURNING *
  `;
  return rowToIssue(rows[0] as Record<string, unknown>);
}

// Fills in the async translation (see the type comment above) once
// lib/translate.ts's call resolves — called from the route, not awaited by
// reportTeamHubIssue itself, so a slow/failed translation never delays the
// crew's "Send" response.
export async function setTeamHubIssueNoteTranslation(issueId: number, noteEnglish: string, noteLanguage: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE hub_issues SET note_english = ${noteEnglish}, note_language = ${noteLanguage} WHERE id = ${issueId}`;
}

// Admin: every issue for one site (across all its crews), newest first,
// with each issue's photo URLs attached — batched (one extra query for all
// photos, not one per issue) the same way the archived Site Supply Link's
// listQueue did.
export async function listTeamHubIssuesForSite(siteId: number, limit = 200): Promise<TeamHubIssue[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT i.*, w.first_name AS worker_first_name
    FROM hub_issues i
    LEFT JOIN hub_workers w ON w.id = i.worker_id
    WHERE i.site_id = ${siteId}
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `;
  const issues = rows.map((r) => rowToIssue(r as Record<string, unknown>));
  const photosByIssueId = await getTeamHubPhotosForParents(
    "issue",
    issues.map((i) => i.id)
  );
  for (const issue of issues) {
    issue.photos = photosByIssueId.get(issue.id) ?? [];
  }
  return issues;
}

export async function setTeamHubIssueStatus(issueId: number, status: "open" | "resolved"): Promise<TeamHubIssue | null> {
  const sql = getSql();
  const rows =
    status === "resolved"
      ? await sql`UPDATE hub_issues SET status = 'resolved', resolved_at = now() WHERE id = ${issueId} RETURNING *`
      : await sql`UPDATE hub_issues SET status = 'open', resolved_at = NULL WHERE id = ${issueId} RETURNING *`;
  return rows.length > 0 ? rowToIssue(rows[0] as Record<string, unknown>) : null;
}

// Manual-only linkage (admin pastes in the complaint id after saving it
// through the existing /complaints/new flow — see docs/team-hub-spec.md
// Phase 4: this never auto-creates a complaint or touches the sub score).
export async function setTeamHubIssueComplaintId(issueId: number, complaintId: string): Promise<TeamHubIssue | null> {
  const sql = getSql();
  const rows = await sql`UPDATE hub_issues SET complaint_id = ${complaintId} WHERE id = ${issueId} RETURNING *`;
  return rows.length > 0 ? rowToIssue(rows[0] as Record<string, unknown>) : null;
}

// ─── hub_photos ─────────────────────────────────────────────────────────
// parent_id isn't an FK (see §7 of the spec) — every caller must already
// know parentId belongs to the right owner (crew/site) before calling this;
// nothing here re-validates that.

export type TeamHubPhotoParentType = "issue" | "run_item" | "round_check" | "handoff" | "request_completion";

export async function addTeamHubPhoto(input: {
  parentType: TeamHubPhotoParentType;
  parentId: number;
  blobUrl: string;
  workerId: number | null;
}): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO hub_photos (parent_type, parent_id, blob_url, worker_id)
    VALUES (${input.parentType}, ${input.parentId}, ${input.blobUrl}, ${input.workerId})
  `;
}

export async function getTeamHubPhotosForParents(parentType: TeamHubPhotoParentType, parentIds: number[]): Promise<Map<number, string[]>> {
  const map = new Map<number, string[]>();
  if (parentIds.length === 0) return map;
  const sql = getSql();
  const rows = await sql`
    SELECT parent_id, blob_url FROM hub_photos
    WHERE parent_type = ${parentType} AND parent_id = ANY(${parentIds})
    ORDER BY created_at ASC
  `;
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const parentId = row.parent_id as number;
    if (!map.has(parentId)) map.set(parentId, []);
    map.get(parentId)!.push(row.blob_url as string);
  }
  return map;
}

// ─── supply_orders / supply_order_lines (Phase 4: "Order supplies") ──────

export type TeamHubSupplyOrderStatus = "new" | "ordered" | "delivered" | "cancelled";

export type TeamHubSupplyOrderLine = { itemId: number; itemName: string; unit: string; qty: number; equipmentPartId: string | null };

export type TeamHubSupplyOrder = {
  id: number;
  siteId: number;
  crewId: number;
  workerId: number | null;
  workerFirstName: string | null;
  status: TeamHubSupplyOrderStatus;
  note: string;
  // SHARED TRANSLATION (docs/team-hub-spec.md §12) — see the matching
  // TeamHubIssue fields' comment; same null-until-translated contract.
  noteEnglish: string | null;
  noteLanguage: string | null;
  createdAt: string;
  updatedAt: string;
  lines: TeamHubSupplyOrderLine[];
};

function rowToSupplyOrder(row: Record<string, unknown>): TeamHubSupplyOrder {
  return {
    id: row.id as number,
    siteId: row.site_id as number,
    crewId: row.crew_id as number,
    workerId: (row.worker_id as number | null) ?? null,
    workerFirstName: (row.worker_first_name as string | null) ?? null,
    status: row.status as TeamHubSupplyOrderStatus,
    note: (row.note as string) ?? "",
    noteEnglish: (row.note_english as string | null) ?? null,
    noteLanguage: (row.note_language as string | null) ?? null,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    lines: [],
  };
}

// Fills in the async translation (route-driven, same pattern as
// setTeamHubIssueNoteTranslation) once lib/translate.ts's call resolves.
export async function setTeamHubSupplyOrderNoteTranslation(orderId: number, noteEnglish: string, noteLanguage: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE supply_orders SET note_english = ${noteEnglish}, note_language = ${noteLanguage} WHERE id = ${orderId}`;
}

async function getSupplyOrderLines(orderIds: number[]): Promise<Map<number, TeamHubSupplyOrderLine[]>> {
  const map = new Map<number, TeamHubSupplyOrderLine[]>();
  if (orderIds.length === 0) return map;
  const sql = getSql();
  const rows = await sql`
    SELECT sol.order_id, sol.item_id, si.name AS item_name, si.unit, sol.qty, si.equipment_part_id
    FROM supply_order_lines sol
    JOIN supply_items si ON si.id = sol.item_id
    WHERE sol.order_id = ANY(${orderIds})
    ORDER BY si.sort_order ASC, si.name ASC
  `;
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    const orderId = row.order_id as number;
    const line: TeamHubSupplyOrderLine = {
      itemId: row.item_id as number,
      itemName: row.item_name as string,
      unit: row.unit as string,
      qty: row.qty as number,
      equipmentPartId: (row.equipment_part_id as string | null) ?? null,
    };
    if (!map.has(orderId)) map.set(orderId, []);
    map.get(orderId)!.push(line);
  }
  return map;
}

// Validates every line's itemId against THIS crew's own enabled supply
// items (not the global catalog) — same defense-in-depth reasoning as
// upsertTeamHubChecklistRunItem/recordTeamHubRoundCheck.
export async function createTeamHubSupplyOrder(input: {
  siteId: number;
  crewId: number;
  workerId: number;
  note: string;
  lines: { itemId: number; qty: number }[];
}): Promise<TeamHubSupplyOrder> {
  const allowed = await listEnabledTeamHubSupplyItemsForCrew(input.crewId);
  const allowedIds = new Set(allowed.map((i) => i.itemId));

  const lines = input.lines
    .filter((l) => Number.isInteger(l.itemId) && allowedIds.has(l.itemId) && Number.isInteger(l.qty) && l.qty > 0)
    .map((l) => ({ itemId: l.itemId, qty: Math.min(l.qty, 999) }));

  if (lines.length === 0) {
    throw new Error("Add at least one item before sending.");
  }

  const note = input.note.trim().slice(0, 1000);
  const sql = getSql();
  const rows = await sql`
    INSERT INTO supply_orders (site_id, crew_id, worker_id, note) VALUES (${input.siteId}, ${input.crewId}, ${input.workerId}, ${note})
    RETURNING *
  `;
  const order = rowToSupplyOrder(rows[0] as Record<string, unknown>);

  for (const line of lines) {
    await sql`INSERT INTO supply_order_lines (order_id, item_id, qty) VALUES (${order.id}, ${line.itemId}, ${line.qty})`;
  }
  order.lines = lines.map((l) => {
    const item = allowed.find((i) => i.itemId === l.itemId)!;
    return { itemId: l.itemId, itemName: item.name, unit: item.unit, qty: l.qty, equipmentPartId: item.equipmentPartId };
  });
  return order;
}

export async function listRecentTeamHubSupplyOrdersForCrew(crewId: number, limit = 10): Promise<TeamHubSupplyOrder[]> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM supply_orders WHERE crew_id = ${crewId} ORDER BY created_at DESC LIMIT ${limit}`;
  const orders = rows.map((r) => rowToSupplyOrder(r as Record<string, unknown>));
  const linesByOrderId = await getSupplyOrderLines(orders.map((o) => o.id));
  for (const order of orders) order.lines = linesByOrderId.get(order.id) ?? [];
  return orders;
}

// Admin: every order for one site (across all its crews).
export async function listTeamHubSupplyOrdersForSite(siteId: number, limit = 200): Promise<TeamHubSupplyOrder[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT so.*, w.first_name AS worker_first_name
    FROM supply_orders so
    LEFT JOIN hub_workers w ON w.id = so.worker_id
    WHERE so.site_id = ${siteId}
    ORDER BY so.created_at DESC
    LIMIT ${limit}
  `;
  const orders = rows.map((r) => rowToSupplyOrder(r as Record<string, unknown>));
  const linesByOrderId = await getSupplyOrderLines(orders.map((o) => o.id));
  for (const order of orders) order.lines = linesByOrderId.get(order.id) ?? [];
  return orders;
}

// Returns the updated order WITH lines (the caller — the admin route —
// needs the lines' equipmentPartId to decide what to decrement in
// Equipment when status becomes 'delivered'; that Sheets call happens in
// the route, not here — this file never imports lib/googleSheets.ts).
export async function setTeamHubSupplyOrderStatus(orderId: number, status: TeamHubSupplyOrderStatus): Promise<TeamHubSupplyOrder | null> {
  const sql = getSql();
  const rows = await sql`UPDATE supply_orders SET status = ${status}, updated_at = now() WHERE id = ${orderId} RETURNING *`;
  if (rows.length === 0) return null;
  const order = rowToSupplyOrder(rows[0] as Record<string, unknown>);
  const linesByOrderId = await getSupplyOrderLines([order.id]);
  order.lines = linesByOrderId.get(order.id) ?? [];
  return order;
}

export type VerifyWorkerPinResult =
  | { outcome: "ok"; worker: TeamHubWorker }
  // justLocked distinguishes "this attempt just tripped the lock" from
  // "already locked from an earlier attempt" — the caller (the login route)
  // uses this to send the admin lockout alert exactly once per lockout
  // instead of once per attempt during the lock window.
  | { outcome: "locked"; lockedUntil: string; worker: { id: number; firstName: string }; justLocked: boolean }
  | { outcome: "invalid" }
  | { outcome: "not-found" };

// Self-contained login check: validates crew membership + active + lockout
// + PIN in one call, and updates failed_attempts/locked_until/last_sign_in_at
// as a side effect — mirrors lib/managerAccounts.ts's split of
// verifyManagerPassword (read-only) from the caller's own state updates,
// except here the lockout bookkeeping is common enough to every caller
// (there's only ever one: the login route) that it belongs inside the query
// layer rather than duplicated at the route. Neon's serverless tagged-
// template driver doesn't support nested sql fragments as interpolated
// values (unlike postgres.js) — the lock-vs-no-lock branch is therefore two
// separate plain UPDATEs, not one query built with a conditional fragment.
export async function verifyTeamHubWorkerPin(
  crewId: number,
  workerId: number,
  pin: string,
  device: string | null
): Promise<VerifyWorkerPinResult> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM hub_workers WHERE id = ${workerId} AND crew_id = ${crewId} LIMIT 1`;
  if (rows.length === 0) return { outcome: "not-found" };
  const worker = rowToWorker(rows[0] as Record<string, unknown>);
  if (!worker.active) return { outcome: "not-found" };

  if (worker.lockedUntil && new Date(worker.lockedUntil).getTime() > Date.now()) {
    return {
      outcome: "locked",
      lockedUntil: worker.lockedUntil,
      worker: { id: worker.id, firstName: worker.firstName },
      justLocked: false,
    };
  }

  const pinHash = (rows[0] as Record<string, unknown>).pin_hash as string;
  const matches = await bcrypt.compare(pin, pinHash);

  if (!matches) {
    const nextAttempts = worker.failedAttempts + 1;
    const lock = nextAttempts >= MAX_FAILED_ATTEMPTS;

    if (lock) {
      const lockedUntilIso = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
      await sql`
        UPDATE hub_workers SET failed_attempts = ${nextAttempts}, locked_until = ${lockedUntilIso} WHERE id = ${workerId}
      `;
      return {
        outcome: "locked",
        lockedUntil: lockedUntilIso,
        worker: { id: worker.id, firstName: worker.firstName },
        justLocked: true,
      };
    }

    await sql`UPDATE hub_workers SET failed_attempts = ${nextAttempts} WHERE id = ${workerId}`;
    return { outcome: "invalid" };
  }

  const updatedRows = await sql`
    UPDATE hub_workers
    SET failed_attempts = 0, locked_until = NULL, last_sign_in_at = now(), last_device = ${device}
    WHERE id = ${workerId}
    RETURNING *
  `;
  return { outcome: "ok", worker: rowToWorker(updatedRows[0] as Record<string, unknown>) };
}

// ─── Activity feed (Phase 6: per-account "what happened" feed) ──────────
// Deliberately NOT lib/activityLog.ts (the manager/owner audit trail) —
// this is an operational feed of what crews actually DID (checklist
// submissions, round check-ins, problem reports, supply orders), sourced
// straight from Team Hub's own already-timestamped tables. Keeps the two
// logs separate on purpose, same reasoning as Sub Center's activity log
// staying separate from Settings' Activity Log.

export type TeamHubActivityEvent =
  | { kind: "checklist_submitted"; at: string; crewId: number; crewName: string; doneCount: number }
  | { kind: "round_check"; at: string; crewId: number; crewName: string; roundName: string; workerFirstName: string | null }
  | { kind: "issue_reported"; at: string; crewId: number; crewName: string; category: TeamHubIssueCategory; workerFirstName: string | null }
  | { kind: "supply_order"; at: string; crewId: number; crewName: string; itemCount: number; workerFirstName: string | null };

export async function getTeamHubActivityFeedForSite(siteId: number, limit = 50): Promise<TeamHubActivityEvent[]> {
  const sql = getSql();
  const perKindLimit = Math.min(limit, 200);

  const [checklistRows, roundRows, issueRows, orderRows] = await Promise.all([
    sql`
      SELECT r.submitted_at AS at, c.id AS crew_id, c.name AS crew_name, COUNT(ri.id)::int AS done_count
      FROM hub_checklist_runs r
      JOIN hub_crews c ON c.id = r.crew_id
      LEFT JOIN hub_checklist_run_items ri ON ri.run_id = r.id
      WHERE c.site_id = ${siteId} AND r.submitted_at IS NOT NULL
      GROUP BY r.id, c.id, c.name
      ORDER BY r.submitted_at DESC LIMIT ${perKindLimit}
    `,
    sql`
      SELECT rc.checked_at AS at, c.id AS crew_id, c.name AS crew_name, rl.name AS round_name, w.first_name AS worker_first_name
      FROM hub_round_checks rc
      JOIN hub_crew_items ci ON ci.id = rc.crew_item_id
      JOIN hub_crews c ON c.id = ci.crew_id
      JOIN hub_round_library rl ON rl.id = ci.item_id
      LEFT JOIN hub_workers w ON w.id = rc.worker_id
      WHERE c.site_id = ${siteId}
      ORDER BY rc.checked_at DESC LIMIT ${perKindLimit}
    `,
    sql`
      SELECT i.created_at AS at, c.id AS crew_id, c.name AS crew_name, i.category, w.first_name AS worker_first_name
      FROM hub_issues i
      JOIN hub_crews c ON c.id = i.crew_id
      LEFT JOIN hub_workers w ON w.id = i.worker_id
      WHERE i.site_id = ${siteId}
      ORDER BY i.created_at DESC LIMIT ${perKindLimit}
    `,
    sql`
      SELECT so.created_at AS at, c.id AS crew_id, c.name AS crew_name, w.first_name AS worker_first_name, COUNT(sol.id)::int AS item_count
      FROM supply_orders so
      JOIN hub_crews c ON c.id = so.crew_id
      LEFT JOIN hub_workers w ON w.id = so.worker_id
      LEFT JOIN supply_order_lines sol ON sol.order_id = so.id
      WHERE so.site_id = ${siteId}
      GROUP BY so.id, c.id, c.name, w.first_name
      ORDER BY so.created_at DESC LIMIT ${perKindLimit}
    `,
  ]);

  const events: TeamHubActivityEvent[] = [];
  for (const r of checklistRows) {
    const row = r as Record<string, unknown>;
    events.push({ kind: "checklist_submitted", at: toIso(row.at), crewId: row.crew_id as number, crewName: row.crew_name as string, doneCount: row.done_count as number });
  }
  for (const r of roundRows) {
    const row = r as Record<string, unknown>;
    events.push({
      kind: "round_check",
      at: toIso(row.at),
      crewId: row.crew_id as number,
      crewName: row.crew_name as string,
      roundName: row.round_name as string,
      workerFirstName: (row.worker_first_name as string | null) ?? null,
    });
  }
  for (const r of issueRows) {
    const row = r as Record<string, unknown>;
    events.push({
      kind: "issue_reported",
      at: toIso(row.at),
      crewId: row.crew_id as number,
      crewName: row.crew_name as string,
      category: row.category as TeamHubIssueCategory,
      workerFirstName: (row.worker_first_name as string | null) ?? null,
    });
  }
  for (const r of orderRows) {
    const row = r as Record<string, unknown>;
    events.push({
      kind: "supply_order",
      at: toIso(row.at),
      crewId: row.crew_id as number,
      crewName: row.crew_name as string,
      itemCount: row.item_count as number,
      workerFirstName: (row.worker_first_name as string | null) ?? null,
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events.slice(0, limit);
}

// ─── Cross-site staff queue (Phase 6) ────────────────────────────────────
// Everything below returns hub_sites.account_id alongside the row (never
// name/address — direction 8) so the caller can attach real account names
// via lib/teamHubAccountLookup.ts, the one sanctioned choke point. No
// Sheets reads in this file.

export type TeamHubQueueIssue = TeamHubIssue & { accountId: string; siteLabel: string; crewName: string };
export type TeamHubQueueOrder = TeamHubSupplyOrder & { accountId: string; siteLabel: string; crewName: string };

export async function listOpenTeamHubIssuesAcrossSites(limit = 200): Promise<TeamHubQueueIssue[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT i.*, w.first_name AS worker_first_name, s.account_id, s.label AS site_label, c.name AS crew_name
    FROM hub_issues i
    JOIN hub_sites s ON s.id = i.site_id
    JOIN hub_crews c ON c.id = i.crew_id
    LEFT JOIN hub_workers w ON w.id = i.worker_id
    WHERE i.status = 'open'
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `;
  const issues = rows.map((r) => {
    const row = r as Record<string, unknown>;
    return { ...rowToIssue(row), accountId: row.account_id as string, siteLabel: row.site_label as string, crewName: row.crew_name as string };
  });
  const photosByIssueId = await getTeamHubPhotosForParents("issue", issues.map((i) => i.id));
  for (const issue of issues) issue.photos = photosByIssueId.get(issue.id) ?? [];
  return issues;
}

export async function listOpenTeamHubSupplyOrdersAcrossSites(limit = 200): Promise<TeamHubQueueOrder[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT so.*, w.first_name AS worker_first_name, s.account_id, s.label AS site_label, c.name AS crew_name
    FROM supply_orders so
    JOIN hub_sites s ON s.id = so.site_id
    JOIN hub_crews c ON c.id = so.crew_id
    LEFT JOIN hub_workers w ON w.id = so.worker_id
    WHERE so.status IN ('new', 'ordered')
    ORDER BY so.created_at DESC
    LIMIT ${limit}
  `;
  const orders = rows.map((r) => {
    const row = r as Record<string, unknown>;
    return { ...rowToSupplyOrder(row), accountId: row.account_id as string, siteLabel: row.site_label as string, crewName: row.crew_name as string };
  });
  const linesByOrderId = await getSupplyOrderLines(orders.map((o) => o.id));
  for (const order of orders) order.lines = linesByOrderId.get(order.id) ?? [];
  return orders;
}

// Sub Center read-only list: same two queries, scoped to crews owned by one
// sub (hub_crews.crew_kind = 'sub' AND sub_id = X) rather than every site.
export async function listOpenTeamHubIssuesForSub(subId: string, limit = 200): Promise<TeamHubQueueIssue[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT i.*, w.first_name AS worker_first_name, s.account_id, s.label AS site_label, c.name AS crew_name
    FROM hub_issues i
    JOIN hub_sites s ON s.id = i.site_id
    JOIN hub_crews c ON c.id = i.crew_id
    LEFT JOIN hub_workers w ON w.id = i.worker_id
    WHERE i.status = 'open' AND c.crew_kind = 'sub' AND c.sub_id = ${subId}
    ORDER BY i.created_at DESC
    LIMIT ${limit}
  `;
  const issues = rows.map((r) => {
    const row = r as Record<string, unknown>;
    return { ...rowToIssue(row), accountId: row.account_id as string, siteLabel: row.site_label as string, crewName: row.crew_name as string };
  });
  const photosByIssueId = await getTeamHubPhotosForParents("issue", issues.map((i) => i.id));
  for (const issue of issues) issue.photos = photosByIssueId.get(issue.id) ?? [];
  return issues;
}

export async function listOpenTeamHubSupplyOrdersForSub(subId: string, limit = 200): Promise<TeamHubQueueOrder[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT so.*, w.first_name AS worker_first_name, s.account_id, s.label AS site_label, c.name AS crew_name
    FROM supply_orders so
    JOIN hub_sites s ON s.id = so.site_id
    JOIN hub_crews c ON c.id = so.crew_id
    LEFT JOIN hub_workers w ON w.id = so.worker_id
    WHERE so.status IN ('new', 'ordered') AND c.crew_kind = 'sub' AND c.sub_id = ${subId}
    ORDER BY so.created_at DESC
    LIMIT ${limit}
  `;
  const orders = rows.map((r) => {
    const row = r as Record<string, unknown>;
    return { ...rowToSupplyOrder(row), accountId: row.account_id as string, siteLabel: row.site_label as string, crewName: row.crew_name as string };
  });
  const linesByOrderId = await getSupplyOrderLines(orders.map((o) => o.id));
  for (const order of orders) order.lines = linesByOrderId.get(order.id) ?? [];
  return orders;
}

// Every distinct sub_id (Team Hub's own scheme — see
// lib/teamHubAccountLookup.ts) that currently owns at least one open issue
// or open order — lets the Sub Center tab list only subs with something to
// show, without the caller needing to know the full sub roster up front.
export async function listTeamHubSubIdsWithOpenItems(): Promise<string[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT DISTINCT c.sub_id
    FROM hub_crews c
    WHERE c.crew_kind = 'sub' AND c.sub_id IS NOT NULL AND (
      EXISTS (SELECT 1 FROM hub_issues i WHERE i.crew_id = c.id AND i.status = 'open')
      OR EXISTS (SELECT 1 FROM supply_orders so WHERE so.crew_id = c.id AND so.status IN ('new', 'ordered'))
    )
  `;
  return rows.map((r) => (r as Record<string, unknown>).sub_id as string);
}

// Accounts Center badge (Phase 6): open-issue count per account_id, for
// every account with at least one open issue — the caller (an admin page)
// decides how/whether to render a zero.
export async function getOpenTeamHubIssueCountsByAccount(): Promise<Map<string, number>> {
  const sql = getSql();
  const rows = await sql`
    SELECT s.account_id, COUNT(*)::int AS n
    FROM hub_issues i
    JOIN hub_sites s ON s.id = i.site_id
    WHERE i.status = 'open'
    GROUP BY s.account_id
  `;
  const map = new Map<string, number>();
  for (const r of rows) {
    const row = r as Record<string, unknown>;
    map.set(row.account_id as string, row.n as number);
  }
  return map;
}

// ─── Night-checklist cutoff alert (Phase 6) ─────────────────────────────
// Polled by app/api/cron/team-hub-checklist-alerts/route.ts on a Vercel
// Cron schedule (see vercel.json). hub_checklist_alerts_sent is this
// function's own idempotency guard — see its CREATE TABLE comment.

export type TeamHubNightChecklistAlert = { site: TeamHubSite; crew: TeamHubCrew };

// Sites configured for the alert (non-null cutoff + at least one service
// day, still active) whose local day-of-week/time-of-day are past due,
// which have an active night crew, that crew hasn't submitted a checklist
// run yet today, and no alert has already gone out today for this site.
// Returns the (site, crew) pairs the cron route should actually email for.
export async function findTeamHubSitesNeedingNightChecklistAlert(atInstant: Date = new Date()): Promise<TeamHubNightChecklistAlert[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM hub_sites
    WHERE active = true AND night_checklist_cutoff_time IS NOT NULL AND night_checklist_service_days IS NOT NULL
  `;
  const sites = rows.map((r) => rowToSite(r as Record<string, unknown>));
  if (sites.length === 0) return [];

  const today = getDateStringInTimeZone(atInstant, TEAM_HUB_TIMEZONE);
  const dayOfWeek = getDayOfWeekInTimeZone(atInstant, TEAM_HUB_TIMEZONE);
  const minutesNow = getMinutesSinceMidnightInTimeZone(atInstant, TEAM_HUB_TIMEZONE);
  const todayStart = startOfDayInTimeZone(atInstant, TEAM_HUB_TIMEZONE);

  const results: TeamHubNightChecklistAlert[] = [];
  for (const site of sites) {
    if (!site.nightChecklistServiceDays?.includes(dayOfWeek)) continue;

    const [cutoffHour, cutoffMinute] = site.nightChecklistCutoffTime!.split(":").map(Number);
    if (minutesNow < cutoffHour * 60 + cutoffMinute) continue;

    const alreadySentRows = await sql`SELECT 1 FROM hub_checklist_alerts_sent WHERE site_id = ${site.id} AND alert_date = ${today} LIMIT 1`;
    if (alreadySentRows.length > 0) continue;

    const crewRows = await sql`SELECT * FROM hub_crews WHERE site_id = ${site.id} AND crew_type = 'night' AND active = true LIMIT 1`;
    if (crewRows.length === 0) continue;
    const crew = rowToCrew(crewRows[0] as Record<string, unknown>);

    const submittedRows = await sql`
      SELECT 1 FROM hub_checklist_runs WHERE crew_id = ${crew.id} AND submitted_at >= ${todayStart.toISOString()} LIMIT 1
    `;
    if (submittedRows.length > 0) continue;

    results.push({ site, crew });
  }
  return results;
}

// Marks the alert sent for (site, today) — ON CONFLICT DO NOTHING so a
// second cron tick within the same minute (or a retried request) can't
// double-insert; the UNIQUE(site_id, alert_date) constraint is what makes
// this the alert's actual dedup guarantee, not just this INSERT's phrasing.
export async function recordTeamHubChecklistAlertSent(siteId: number, atInstant: Date = new Date()): Promise<void> {
  const today = getDateStringInTimeZone(atInstant, TEAM_HUB_TIMEZONE);
  const sql = getSql();
  await sql`
    INSERT INTO hub_checklist_alerts_sent (site_id, alert_date) VALUES (${siteId}, ${today})
    ON CONFLICT (site_id, alert_date) DO NOTHING
  `;
}
