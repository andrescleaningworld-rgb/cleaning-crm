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
};

function rowToSite(row: Record<string, unknown>): TeamHubSite {
  return {
    id: row.id as number,
    accountId: row.account_id as string,
    label: row.label as string,
    supervisorPhone: (row.supervisor_phone as string | null) ?? null,
    active: row.active as boolean,
    createdAt: toIso(row.created_at),
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
      hub_sites.supervisor_phone AS site_supervisor_phone, hub_sites.active AS site_active, hub_sites.created_at AS site_created_at
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
