// Server-only Postgres query layer for the Activity Log (activity_log table —
// see scripts/setup-manager-auth-db.js; source / account_id / sub_id from
// migration 084). Owner-only at Settings -> Activity Log, in three tabs:
//
//   admin     what staff did in the CRM
//   sub       what subs did: their portal, CW Now crews, the team hub. The sub
//             portal's own log (sub_activity_log: logins, pages viewed, issues
//             reported) is shown in this tab too.
//   customer  what customers did: the customer portal (logins, problems,
//             requests, opening the portal), check-in answers, shared links
//
// Every write says which portal it came from (source). Callers that do not
// say are sorted by the actor's role: sub / porter / team-hub -> sub,
// guest / customer -> customer, anything else -> admin.

import { getSql } from "@/lib/db";

export type ActivityActorRole = "manager" | "owner" | "porter" | "team-hub" | "guest" | "sub" | "customer";
export type ActivityAction = "create" | "update" | "delete" | "login" | "logout" | "view";
export type ActivitySource = "admin" | "sub" | "customer";
export const ACTIVITY_SOURCES: ActivitySource[] = ["admin", "sub", "customer"];

export type LogActivityInput = {
  actorAccountId: string | null;
  actorRole: ActivityActorRole;
  actorName: string;
  action: ActivityAction;
  entityType: string;
  entityId?: string | null;
  detail?: string | null;
  /** Which portal it came from; worked out from actorRole when not given. */
  source?: ActivitySource;
  /** The account it is about (the Customers tab's filter); the entity when entityType is "account". */
  accountId?: string | null;
  /** The sub it is about or by (the Subs tab's filter); the entity when entityType is "subcontractor". */
  subId?: string | null;
};

/** The tab an action belongs to, from who did it. */
export function sourceOfRole(role: string): ActivitySource {
  if (role === "sub" || role === "porter" || role === "team-hub") return "sub";
  if (role === "guest" || role === "customer") return "customer";
  return "admin";
}

// Migration 084 (source / account_id / sub_id). Until it runs, writes and reads use the old columns.
// Only "yes" is remembered, so the columns are used as soon as the migration runs.
let sourceColumns = false;
async function hasSourceColumns(): Promise<boolean> {
  if (sourceColumns) return true;
  try {
    const rows = (await getSql()`
      SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'activity_log' AND column_name = 'source') AS ok
    `) as { ok: boolean }[];
    sourceColumns = rows[0]?.ok === true;
  } catch {
    return false;
  }
  return sourceColumns;
}

// Fire-and-forget by design: a logging failure must never break the
// underlying mutation it's describing, so this swallows and reports its own
// errors rather than throwing (matches the defensive style of
// identifyManager in app/components/OneSignalInit.tsx).
export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const sql = getSql();
    const entityId = input.entityId ?? null;
    if (await hasSourceColumns()) {
      const source = input.source ?? sourceOfRole(input.actorRole);
      const accountId = input.accountId ?? (input.entityType === "account" ? entityId : null);
      const subId = input.subId ?? (input.entityType === "subcontractor" ? entityId : null);
      await sql`
        INSERT INTO activity_log (actor_account_id, actor_role, actor_name, action, entity_type, entity_id, detail, source, account_id, sub_id)
        VALUES (
          ${input.actorAccountId}, ${input.actorRole}, ${input.actorName},
          ${input.action}, ${input.entityType}, ${entityId}, ${input.detail ?? null},
          ${source}, ${accountId}, ${subId}
        )
      `;
      return;
    }
    await sql`
      INSERT INTO activity_log (actor_account_id, actor_role, actor_name, action, entity_type, entity_id, detail)
      VALUES (
        ${input.actorAccountId}, ${input.actorRole}, ${input.actorName},
        ${input.action}, ${input.entityType}, ${entityId}, ${input.detail ?? null}
      )
    `;
  } catch (error) {
    console.error("[logActivity] failed to write audit log entry:", error);
  }
}

/**
 * Something a customer did in the customer portal (or a check-in answer):
 * the Customers tab, under the account's name with a CUSTOMER badge.
 */
export function logCustomerActivity(input: { accountId: string; accountName: string; action: ActivityAction; detail: string; email?: string }): Promise<void> {
  return logActivity({
    actorAccountId: null,
    actorRole: "customer",
    actorName: input.accountName || input.email || "Customer",
    action: input.action,
    entityType: "account",
    entityId: input.accountId,
    accountId: input.accountId,
    detail: input.email ? `${input.detail} (${input.email})` : input.detail,
    source: "customer",
  });
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

/* ---------- the three tabs (Settings -> Activity Log) ---------- */

export type ActivityFeedEntry = {
  /** "a<id>" for activity_log, "s<id>" for the sub portal's own log. */
  key: string;
  source: ActivitySource;
  actorRole: string;
  actorName: string;
  action: string;
  entityType: string;
  entityId: string | null;
  detail: string | null;
  accountId: string | null;
  subId: string | null;
  createdAt: string;
};

export type ActivityFeedFilters = {
  tab: ActivitySource;
  /** Admin tab: one staff member (manager_accounts id). */
  actorAccountId?: string;
  /** Subs tab: one sub (subcontractors.id). */
  subId?: string;
  /** Customers tab: one account (accounts.id). */
  accountId?: string;
  start?: string; // inclusive
  end?: string; // exclusive
  offset?: number;
  limit?: number;
};

// Before migration 084 the tab is worked out from the row the same way the migration fills it in.
const DERIVED_SOURCE = `CASE WHEN l.actor_role IN ('sub','porter','team-hub') OR l.detail ILIKE '%sent from the sub portal%' THEN 'sub'
  WHEN l.actor_role IN ('guest','customer') OR l.actor_name = 'Customer' THEN 'customer' ELSE 'admin' END`;
const DERIVED_ACCOUNT = `CASE WHEN l.entity_type = 'account' THEN l.entity_id END`;
const DERIVED_SUB = `CASE WHEN l.entity_type = 'subcontractor' THEN l.entity_id END`;

// The sub portal's own log: a New York wall-clock time with no zone (migration 004).
const SUB_LOG_TIME = `(s.logged_at AT TIME ZONE 'America/New_York')`;

const iso = (value: unknown) => ((value as Date | string) instanceof Date ? (value as Date).toISOString() : new Date(String(value)).toISOString());

/** One page of a tab, newest first. hasMore: there is another page after it. */
export async function listActivityFeed(filters: ActivityFeedFilters): Promise<{ entries: ActivityFeedEntry[]; hasMore: boolean }> {
  const withColumns = await hasSourceColumns();
  const src = withColumns ? "l.source" : DERIVED_SOURCE;
  const acc = withColumns ? `COALESCE(l.account_id, ${DERIVED_ACCOUNT})` : DERIVED_ACCOUNT;
  const sb = withColumns ? `COALESCE(l.sub_id, ${DERIVED_SUB})` : DERIVED_SUB;
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  const params: unknown[] = [filters.tab];
  const param = (value: unknown) => {
    params.push(value);
    return `$${params.length}`;
  };
  const logWhere = [`${src} = $1`];
  const subWhere = ["s.logged_at IS NOT NULL"];
  if (filters.start) {
    const p = param(filters.start);
    logWhere.push(`l.created_at >= ${p}::timestamptz`);
    subWhere.push(`${SUB_LOG_TIME} >= ${p}::timestamptz`);
  }
  if (filters.end) {
    const p = param(filters.end);
    logWhere.push(`l.created_at < ${p}::timestamptz`);
    subWhere.push(`${SUB_LOG_TIME} < ${p}::timestamptz`);
  }
  if (filters.tab === "admin" && filters.actorAccountId) logWhere.push(`l.actor_account_id = ${param(filters.actorAccountId)}`);
  if (filters.tab === "sub" && filters.subId) {
    const p = param(filters.subId);
    logWhere.push(`${sb} = ${p}`);
    subWhere.push(`s.subcontractor_id = ${p}`);
  }
  if (filters.tab === "customer" && filters.accountId) logWhere.push(`${acc} = ${param(filters.accountId)}`);

  // Older check-in answers were written as "Customer": shown under the account's name.
  const actorName = `CASE WHEN l.actor_name = 'Customer' AND l.entity_type = 'account'
      THEN COALESCE((SELECT NULLIF(btrim(a.account_name), '') FROM accounts a WHERE a.id = l.entity_id LIMIT 1), l.actor_name) ELSE l.actor_name END`;
  const fromLog = `SELECT 'a' || l.id AS key, ${src} AS source, l.actor_role, ${actorName} AS actor_name, l.action, l.entity_type, l.entity_id, l.detail,
      ${acc} AS account_id, ${sb} AS sub_id, l.created_at
    FROM activity_log l WHERE ${logWhere.join(" AND ")}`;
  const fromSubLog = `SELECT 's' || s.id AS key, 'sub' AS source, 'sub' AS actor_role,
      COALESCE(NULLIF(btrim(s.subcontractor_name), ''), NULLIF(btrim(sc.company_name), ''), s.subcontractor_email) AS actor_name,
      s.action_type AS action, 'sub portal' AS entity_type, NULL::text AS entity_id, NULLIF(btrim(s.details), '') AS detail,
      NULL::text AS account_id, s.subcontractor_id AS sub_id, ${SUB_LOG_TIME} AS created_at
    FROM sub_activity_log s LEFT JOIN subcontractors sc ON sc.id = s.subcontractor_id WHERE ${subWhere.join(" AND ")}`;
  const union = filters.tab === "sub" ? `${fromLog} UNION ALL ${fromSubLog}` : fromLog;

  const rows = (await getSql().query(`SELECT * FROM (${union}) feed ORDER BY created_at DESC, key DESC OFFSET ${offset} LIMIT ${limit + 1}`, params)) as Record<string, unknown>[];
  const entries = rows.slice(0, limit).map((row) => ({
    key: String(row.key),
    source: row.source as ActivitySource,
    actorRole: String(row.actor_role ?? ""),
    actorName: String(row.actor_name ?? ""),
    action: String(row.action ?? ""),
    entityType: String(row.entity_type ?? ""),
    entityId: (row.entity_id as string | null) ?? null,
    detail: (row.detail as string | null) ?? null,
    accountId: (row.account_id as string | null) ?? null,
    subId: (row.sub_id as string | null) ?? null,
    createdAt: iso(row.created_at),
  }));
  return { entries, hasMore: rows.length > limit };
}

/** How many entries each tab has after the given moments (the tab badges: new since the last visit). */
export async function countActivitySince(since: Partial<Record<ActivitySource, string>>): Promise<Record<ActivitySource, number>> {
  const out: Record<ActivitySource, number> = { admin: 0, sub: 0, customer: 0 };
  const withColumns = await hasSourceColumns();
  const src = withColumns ? "l.source" : DERIVED_SOURCE;
  const sql = getSql();
  await Promise.all(
    ACTIVITY_SOURCES.map(async (tab) => {
      const at = since[tab];
      if (!at || Number.isNaN(new Date(at).getTime())) return;
      const fromLog = (await sql.query(`SELECT count(*)::int AS n FROM activity_log l WHERE ${src} = $1 AND l.created_at > $2::timestamptz`, [tab, at])) as { n: number }[];
      let n = fromLog[0]?.n ?? 0;
      if (tab === "sub") {
        const fromSubLog = (await sql.query(`SELECT count(*)::int AS n FROM sub_activity_log s WHERE s.logged_at IS NOT NULL AND ${SUB_LOG_TIME} > $1::timestamptz`, [at])) as { n: number }[];
        n += fromSubLog[0]?.n ?? 0;
      }
      out[tab] = n;
    })
  );
  return out;
}

/** The Subs tab's dropdown: every sub, by name. */
export async function listSubsForFilter(): Promise<{ id: string; name: string }[]> {
  const rows = (await getSql()`
    SELECT id, COALESCE(NULLIF(btrim(company_name), ''), NULLIF(btrim(contact_name), ''), email, id) AS name, btrim(status) AS status
    FROM subcontractors WHERE id IS NOT NULL ORDER BY lower(COALESCE(NULLIF(btrim(company_name), ''), NULLIF(btrim(contact_name), ''), email, id))
  `) as { id: string; name: string; status: string }[];
  return rows.map((row) => ({ id: row.id, name: /inactive/i.test(row.status) ? `${row.name} (inactive)` : row.name }));
}
