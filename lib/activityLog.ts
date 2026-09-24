// Server-only Postgres query layer for the manager/owner audit trail
// (activity_log table — see scripts/setup-manager-auth-db.js). Mirrors the
// one-file-per-feature convention used in lib/checklistDb.ts.

import { getSql } from "@/lib/db";

export type ActivityActorRole = "manager" | "owner" | "porter" | "team-hub";
export type ActivityAction = "create" | "update" | "delete" | "login" | "logout";

export type LogActivityInput = {
  actorAccountId: string | null;
  actorRole: ActivityActorRole;
  actorName: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  detail?: string | null;
};

// Fire-and-forget by design: a logging failure must never break the
// underlying mutation it's describing, so this swallows and reports its own
// errors rather than throwing (matches the defensive style of
// identifyManager in app/components/OneSignalInit.tsx).
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const sql = getSql();
    await sql`
      INSERT INTO activity_log (actor_account_id, actor_role, actor_name, action, entity_type, entity_id, detail)
      VALUES (
        ${input.actorAccountId}, ${input.actorRole}, ${input.actorName},
        ${input.action}, ${input.entityType}, ${input.entityId ?? null}, ${input.detail ?? null}
      )
    `;
  } catch (error) {
    console.error("[logActivity] failed to write audit log entry:", error);
  }
}

export type ActivityLogEntry = {
  id: number;
  actorAccountId: string | null;
  actorRole: ActivityActorRole;
  actorName: string;
  action: ActivityAction;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  createdAt: string;
};

function rowToEntry(row: Record<string, unknown>): ActivityLogEntry {
  return {
    id: row.id as number,
    actorAccountId: (row.actor_account_id as string | null) ?? null,
    actorRole: row.actor_role as ActivityActorRole,
    actorName: row.actor_name as string,
    action: row.action as ActivityAction,
    entityType: row.entity_type as string,
    entityId: (row.entity_id as string | null) ?? null,
    detail: (row.detail as string | null) ?? null,
    createdAt: (row.created_at as Date | string) instanceof Date ? (row.created_at as Date).toISOString() : String(row.created_at),
  };
}

export type ActivityLogFilters = {
  actorAccountId?: string;
  start?: string; // ISO date, inclusive
  end?: string; // ISO date, exclusive
  limit?: number;
};

export async function listActivityLog(filters: ActivityLogFilters): Promise<ActivityLogEntry[]> {
  const sql = getSql();
  const limit = Math.min(filters.limit ?? 200, 500);
  const actorAccountId = filters.actorAccountId ?? null;
  const start = filters.start ?? null;
  const end = filters.end ?? null;

  const rows = await sql`
    SELECT * FROM activity_log
    WHERE (${actorAccountId}::text IS NULL OR actor_account_id = ${actorAccountId})
      AND (${start}::text IS NULL OR created_at >= ${start}::timestamptz)
      AND (${end}::text IS NULL OR created_at < ${end}::timestamptz)
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
  return rows.map((r) => rowToEntry(r as Record<string, unknown>));
}

// One record's history (e.g. entity_type "account" + its id), newest first —
// the account page's History section. A filtered read only; the full log
// stays owner-only at /settings/activity-log.
export async function listActivityForEntity(entityType: string, entityId: string, limit = 200): Promise<ActivityLogEntry[]> {
  const sql = getSql();
  const rows = await sql`
    SELECT * FROM activity_log
    WHERE entity_type = ${entityType} AND entity_id = ${entityId}
    ORDER BY created_at DESC
    LIMIT ${Math.min(limit, 500)}
  `;
  return rows.map((r) => rowToEntry(r as Record<string, unknown>));
}
