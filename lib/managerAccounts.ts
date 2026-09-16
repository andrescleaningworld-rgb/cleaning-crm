// Server-only Postgres query layer for individual manager/owner login
// credentials (manager_accounts table — see scripts/setup-manager-auth-db.js).
// Mirrors the one-file-per-feature, typed-function convention used in
// lib/checklistDb.ts. Deliberately holds ONLY auth state (password hash,
// role) — a manager's name/phone/status/calendar color stay in the Managers
// Google Sheet (lib/googleSheets.ts, fetchManagers) as the single source of
// truth for that roster data; sheet_manager_id is the join key back to it.
// Rows are created lazily on first password setup, so there's no fixed list
// of managers to pre-seed and new Sheet managers get the same flow for free.

import bcrypt from "bcryptjs";
import { getSql } from "@/lib/db";
import { fetchManagers } from "@/lib/googleSheets";

const BCRYPT_ROUNDS = 10;

export type ManagerAccountRole = "manager" | "owner";

export type ManagerAccountRow = {
  id: string;
  sheetManagerId: string | null;
  role: ManagerAccountRole;
  displayName: string | null;
  passwordHash: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

function rowToAccount(row: Record<string, unknown>): ManagerAccountRow {
  return {
    id: row.id as string,
    sheetManagerId: (row.sheet_manager_id as string | null) ?? null,
    role: row.role as ManagerAccountRole,
    displayName: (row.display_name as string | null) ?? null,
    passwordHash: (row.password_hash as string | null) ?? null,
    createdAt: (row.created_at as Date | string) instanceof Date ? (row.created_at as Date).toISOString() : String(row.created_at),
    updatedAt: (row.updated_at as Date | string) instanceof Date ? (row.updated_at as Date).toISOString() : String(row.updated_at),
    lastLoginAt: row.last_login_at ? ((row.last_login_at as Date | string) instanceof Date ? (row.last_login_at as Date).toISOString() : String(row.last_login_at)) : null,
  };
}

export async function getAccountBySheetManagerId(sheetManagerId: string): Promise<ManagerAccountRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM manager_accounts WHERE sheet_manager_id = ${sheetManagerId} LIMIT 1`;
  return rows.length > 0 ? rowToAccount(rows[0] as Record<string, unknown>) : null;
}

export async function getAccountById(id: string): Promise<ManagerAccountRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM manager_accounts WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToAccount(rows[0] as Record<string, unknown>) : null;
}

// Single-owner assumption for v1 (per plan) — the schema supports more than
// one 'owner' row later without a migration, this just always takes the
// first one.
export async function getOwnerAccount(): Promise<ManagerAccountRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM manager_accounts WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1`;
  return rows.length > 0 ? rowToAccount(rows[0] as Record<string, unknown>) : null;
}

export type ManagerIdentity = {
  sheetManagerId: string;
  name: string;
  needsSetup: boolean;
  // manager_accounts.id — undefined until the manager has completed
  // first-time setup at least once (no row exists yet). This is the id
  // activity_log.actor_account_id uses, for filtering the audit log by name.
  accountId?: string;
};

// Active managers from the Sheet, joined with whether they've set a
// password yet. A manager with no manager_accounts row at all (brand new,
// never logged in) also reads as needsSetup — no pre-seeding required.
export async function getIdentityRoster(): Promise<ManagerIdentity[]> {
  const [managers, sql] = [await fetchManagers(), getSql()];
  const active = managers.filter((m) => !m.status || m.status === "Active");
  if (active.length === 0) return [];

  const rows = await sql`SELECT id, sheet_manager_id, password_hash FROM manager_accounts WHERE role = 'manager'`;
  const accountsBySheetId = new Map<string, { id: string; hasPassword: boolean }>();
  for (const row of rows as Record<string, unknown>[]) {
    accountsBySheetId.set(row.sheet_manager_id as string, {
      id: row.id as string,
      hasPassword: Boolean(row.password_hash),
    });
  }

  return active
    .filter((m) => m.managerId && m.name)
    .map((m) => {
      const account = accountsBySheetId.get(m.managerId);
      return {
        sheetManagerId: m.managerId,
        name: m.name,
        needsSetup: !account?.hasPassword,
        accountId: account?.id,
      };
    });
}

// Only succeeds when no password is set yet (row missing entirely, or
// present with password_hash IS NULL) — prevents silently overwriting an
// existing manager's password without proof of the old one. Returns null on
// a no-op (password already set), which the caller should surface as an
// error distinct from a normal server failure.
export async function setInitialPassword(
  target: { sheetManagerId: string } | { role: "owner" },
  newPassword: string
): Promise<ManagerAccountRow | null> {
  const sql = getSql();
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  if ("sheetManagerId" in target) {
    const id = crypto.randomUUID();
    const rows = await sql`
      INSERT INTO manager_accounts (id, sheet_manager_id, role, password_hash)
      VALUES (${id}, ${target.sheetManagerId}, 'manager', ${hash})
      ON CONFLICT (sheet_manager_id) DO UPDATE
        SET password_hash = EXCLUDED.password_hash, updated_at = now()
        WHERE manager_accounts.password_hash IS NULL
      RETURNING *
    `;
    return rows.length > 0 ? rowToAccount(rows[0] as Record<string, unknown>) : null;
  }

  // Owner row must already exist (seeded by scripts/setup-manager-auth-db.js)
  // — never created on the fly here, since that would let anyone who finds
  // the hidden owner login route self-provision owner access.
  const rows = await sql`
    UPDATE manager_accounts
    SET password_hash = ${hash}, updated_at = now()
    WHERE role = 'owner' AND password_hash IS NULL
    RETURNING *
  `;
  return rows.length > 0 ? rowToAccount(rows[0] as Record<string, unknown>) : null;
}

export async function verifyManagerPassword(account: ManagerAccountRow, plainPassword: string): Promise<boolean> {
  if (!account.passwordHash) return false;
  return bcrypt.compare(plainPassword, account.passwordHash);
}

// Owner-only action (enforced by the calling route, not here) — clears the
// hash so the manager goes through first-time setup again next login.
export async function resetPasswordBySheetManagerId(sheetManagerId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE manager_accounts SET password_hash = NULL, updated_at = now() WHERE sheet_manager_id = ${sheetManagerId}`;
}

export async function touchLastLogin(accountId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE manager_accounts SET last_login_at = now() WHERE id = ${accountId}`;
}
