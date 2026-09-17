// Server-only Postgres query layer for individual manager/owner login
// credentials (manager_accounts table — see scripts/setup-manager-auth-db.js).
// Mirrors the one-file-per-feature, typed-function convention used in
// lib/checklistDb.ts. Deliberately holds ONLY auth state (password hash,
// role) — identity/role data (name, Manager vs Office/Inside Staff, active)
// stays in the Staff Google Sheet tab (lib/googleSheets.ts, fetchStaff) as
// the single source of truth; staff_id is the join key back to it.
//
// This intentionally does NOT use the separate "Managers" Sheet tab
// (fetchManagers) — that tab is a different, unrelated roster used for
// phone numbers / calendar colors / to-do assignment, and is not gated by
// any role at all. Login eligibility is decided here, at the query level,
// by Staff.role === "Manager" && Staff.active — an "InsideStaff" or
// "OfficeStaff" row can never appear in the roster this returns, no matter
// what the UI does.
//
// There is exactly ONE login flow (see app/api/login and app/api/login/
// setup-password) — everyone, including the owner, picks their name from
// the same Staff-sourced picker and sets/enters a password the same way.
// "Owner" is not a separate identity or a separate route: it's just
// whatever manager_accounts.role a person's row already holds. A row is
// pre-provisioned with role='owner' (via scripts/setup-manager-auth-db.js,
// never self-service) for whoever should get owner-level access; everyone
// else's row is created lazily on first setup with role='manager'. This is
// why setInitialPassword below never lets the CALLER choose a role — the
// role a person ends up with is entirely a function of what's already in
// the database for their staff_id, never something a login request can
// specify.
//
// Rows are created lazily on first password setup, so there's no fixed list
// of managers to pre-seed and new Staff managers get the same flow for free.

import bcrypt from "bcryptjs";
import { getSql } from "@/lib/db";
import { fetchStaff } from "@/lib/googleSheets";

const BCRYPT_ROUNDS = 10;

export type ManagerAccountRole = "manager" | "owner";

export type ManagerAccountRow = {
  id: string;
  staffId: string | null;
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
    staffId: (row.staff_id as string | null) ?? null,
    role: row.role as ManagerAccountRole,
    displayName: (row.display_name as string | null) ?? null,
    passwordHash: (row.password_hash as string | null) ?? null,
    createdAt: (row.created_at as Date | string) instanceof Date ? (row.created_at as Date).toISOString() : String(row.created_at),
    updatedAt: (row.updated_at as Date | string) instanceof Date ? (row.updated_at as Date).toISOString() : String(row.updated_at),
    lastLoginAt: row.last_login_at ? ((row.last_login_at as Date | string) instanceof Date ? (row.last_login_at as Date).toISOString() : String(row.last_login_at)) : null,
  };
}

export async function getAccountByStaffId(staffId: string): Promise<ManagerAccountRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM manager_accounts WHERE staff_id = ${staffId} LIMIT 1`;
  return rows.length > 0 ? rowToAccount(rows[0] as Record<string, unknown>) : null;
}

export async function getAccountById(id: string): Promise<ManagerAccountRow | null> {
  const sql = getSql();
  const rows = await sql`SELECT * FROM manager_accounts WHERE id = ${id} LIMIT 1`;
  return rows.length > 0 ? rowToAccount(rows[0] as Record<string, unknown>) : null;
}

export type ManagerIdentity = {
  staffId: string;
  name: string;
  needsSetup: boolean;
  // manager_accounts.id — undefined until the manager has completed
  // first-time setup at least once (no row exists yet). This is the id
  // activity_log.actor_account_id uses, for filtering the audit log by name.
  accountId?: string;
};

// Active Manager-role Staff, joined with whether they've set a password
// yet. A manager with no manager_accounts row at all (brand new, never
// logged in) also reads as needsSetup — no pre-seeding required. Anyone
// whose Staff role isn't exactly "Manager", or whose Staff row isn't
// active, is filtered out here — before it ever reaches an API response —
// so Office/Inside Staff can never authenticate as a manager even if a
// client bypassed the picker UI entirely.
export async function getIdentityRoster(): Promise<ManagerIdentity[]> {
  const [staff, sql] = [await fetchStaff(), getSql()];
  const activeManagers = staff.filter((s) => s.role === "Manager" && s.active);
  if (activeManagers.length === 0) return [];

  // Every manager_accounts row, regardless of role — the owner's row is
  // keyed to their staff_id exactly like everyone else's, and needs to
  // match here too so their needsSetup/accountId show correctly.
  const rows = await sql`SELECT id, staff_id, password_hash FROM manager_accounts`;
  const accountsByStaffId = new Map<string, { id: string; hasPassword: boolean }>();
  for (const row of rows as Record<string, unknown>[]) {
    accountsByStaffId.set(row.staff_id as string, {
      id: row.id as string,
      hasPassword: Boolean(row.password_hash),
    });
  }

  return activeManagers
    .filter((s) => s.id && s.name)
    .map((s) => {
      const account = accountsByStaffId.get(s.id);
      return {
        staffId: s.id,
        name: s.name,
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
//
// If a row already exists for this staffId (pre-provisioned with
// role='owner', or left over from an earlier partial setup), ON CONFLICT
// only touches password_hash/updated_at — it never overwrites role — so a
// pre-designated owner keeps their role automatically, with no special
// case needed here or in any caller. A brand-new staffId gets role='manager'
// by default, the only role this function can ever assign on its own.
export async function setInitialPassword(staffId: string, newPassword: string): Promise<ManagerAccountRow | null> {
  const sql = getSql();
  const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO manager_accounts (id, staff_id, role, password_hash)
    VALUES (${id}, ${staffId}, 'manager', ${hash})
    ON CONFLICT (staff_id) DO UPDATE
      SET password_hash = EXCLUDED.password_hash, updated_at = now()
      WHERE manager_accounts.password_hash IS NULL
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
export async function resetPasswordByStaffId(staffId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE manager_accounts SET password_hash = NULL, updated_at = now() WHERE staff_id = ${staffId}`;
}

export async function touchLastLogin(accountId: string): Promise<void> {
  const sql = getSql();
  await sql`UPDATE manager_accounts SET last_login_at = now() WHERE id = ${accountId}`;
}
