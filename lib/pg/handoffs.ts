// Handoffs in Postgres (db/migrations/018_handoffs.sql): the step each
// tracked thing is on, the moves between steps, and Settings -> Team.
// Postgres only. Nothing here reads or writes Google Sheets.
//
// The tables may not exist yet in a database (production does not have them
// until migration 018 is applied there), so every caller first asks
// handoffsReady() and treats "not ready" as "this feature is off".

import { getSql } from "@/lib/db";
import {
  ACCOUNT_DONE_STEP,
  currentOnboardingSection,
  sameName,
  type HandoffItem,
  type HandoffKind,
  type HandoffMe,
  type HandoffSettings,
  type OnboardingRule,
} from "@/lib/handoffs";
import type { OnboardingChecklistItems } from "@/lib/onboardingChecklist";

let ready: boolean | null = null;

/**
 * The feature flag. FEATURE_HANDOFFS=1 turns handoffs on, FEATURE_HANDOFFS=0
 * turns them off. Unset: OFF on Production (it stays on today's screens
 * until the cutover), ON in local dev and on Vercel previews, which run on
 * the practice database.
 */
export function handoffsFlagOn(): boolean {
  const flag = (process.env.FEATURE_HANDOFFS ?? "").trim();
  if (flag === "1") return true;
  if (flag === "0") return false;
  if (process.env.NODE_ENV !== "production") return true;
  return process.env.VERCEL_ENV === "preview" || process.env.VERCEL_ENV === "development";
}

export async function handoffsReady(): Promise<boolean> {
  if (!handoffsFlagOn()) return false;
  if (ready === true) return true;
  try {
    const sql = getSql();
    const rows = (await sql`SELECT to_regclass('public.handoff_items') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

type Row = {
  kind: HandoffKind;
  item_id: string;
  title: string;
  account_id: string;
  account_name: string;
  manager: string;
  step: string;
  step_since: string | Date;
  data: Record<string, unknown> | null;
  created_by: string;
  created_at: string | Date;
  done_at: string | Date | null;
  last_by: string | null;
  last_at: string | Date | null;
  last_note: string | null;
};

const iso = (value: string | Date | null | undefined) => (value ? new Date(value).toISOString() : "");

function toItem(row: Row): HandoffItem {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(row.data ?? {})) data[key] = String(value ?? "");
  return {
    kind: row.kind,
    itemId: row.item_id,
    title: row.title,
    accountId: row.account_id,
    accountName: row.account_name,
    manager: row.manager,
    step: row.step,
    stepSince: iso(row.step_since),
    data,
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    doneAt: iso(row.done_at),
    lastBy: row.last_by ?? "",
    lastAt: iso(row.last_at),
    lastNote: row.last_note ?? "",
  };
}

const SELECT_ITEM = `
  SELECT i.*, e.by_name AS last_by, e.at AS last_at, e.note AS last_note
  FROM handoff_items i
  LEFT JOIN LATERAL (
    SELECT by_name, at, note FROM handoff_events ev
    WHERE ev.kind = i.kind AND ev.item_id = i.item_id
    ORDER BY ev.at DESC, ev.id DESC LIMIT 1
  ) e ON true`;

/** Everything still open, plus what was finished in the last 30 days (for "Processed by ..."). */
export async function listHandoffs(): Promise<HandoffItem[]> {
  const sql = getSql();
  const rows = (await sql.query(`${SELECT_ITEM} WHERE i.done_at IS NULL OR i.done_at > now() - interval '30 days' ORDER BY i.step_since ASC`)) as Row[];
  return rows.map(toItem);
}

export async function getHandoff(kind: HandoffKind, itemId: string): Promise<HandoffItem | null> {
  const sql = getSql();
  const rows = (await sql.query(`${SELECT_ITEM} WHERE i.kind = $1 AND i.item_id = $2`, [kind, itemId])) as Row[];
  return rows[0] ? toItem(rows[0]) : null;
}

export type NewHandoff = {
  kind: HandoffKind;
  itemId: string;
  title: string;
  accountId?: string;
  accountName?: string;
  manager?: string;
  step: string;
  /** When it arrived on that step, if not now (an order that was placed days ago). */
  stepSince?: string;
  data?: Record<string, string>;
  createdBy?: string;
};

/** Starts tracking something. Does nothing if it is already tracked. */
export async function startHandoff(input: NewHandoff): Promise<HandoffItem> {
  const sql = getSql();
  const since = input.stepSince && !Number.isNaN(new Date(input.stepSince).getTime()) ? new Date(input.stepSince).toISOString() : null;
  const inserted = (await sql.query(
    `INSERT INTO handoff_items (kind, item_id, title, account_id, account_name, manager, step, step_since, data, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::timestamptz, now()), $9::jsonb, $10)
     ON CONFLICT (kind, item_id) DO NOTHING
     RETURNING item_id`,
    [input.kind, input.itemId, input.title, input.accountId ?? "", input.accountName ?? "", input.manager ?? "", input.step, since, JSON.stringify(input.data ?? {}), input.createdBy ?? ""]
  )) as { item_id: string }[];
  if (inserted.length > 0) {
    await sql.query(`INSERT INTO handoff_events (kind, item_id, from_step, to_step, by_name, note, at) VALUES ($1, $2, '', $3, $4, '', COALESCE($5::timestamptz, now()))`, [
      input.kind,
      input.itemId,
      input.step,
      input.createdBy ?? "",
      since,
    ]);
  }
  return (await getHandoff(input.kind, input.itemId)) as HandoffItem;
}

/** Moves a tracked thing to another step: stamps who and when. Moving to the step it is already on does nothing. */
export async function moveHandoff(input: { kind: HandoffKind; itemId: string; toStep: string; by: string; note?: string; done?: boolean }): Promise<HandoffItem | null> {
  const sql = getSql();
  const current = await getHandoff(input.kind, input.itemId);
  if (!current) return null;
  if (current.step === input.toStep) return current;
  await sql.query(`UPDATE handoff_items SET step = $3, step_since = now(), done_at = CASE WHEN $4::boolean THEN now() ELSE NULL END WHERE kind = $1 AND item_id = $2`, [
    input.kind,
    input.itemId,
    input.toStep,
    input.done === true,
  ]);
  await sql.query(`INSERT INTO handoff_events (kind, item_id, from_step, to_step, by_name, note) VALUES ($1, $2, $3, $4, $5, $6)`, [
    input.kind,
    input.itemId,
    current.step,
    input.toStep,
    input.by,
    (input.note ?? "").trim().slice(0, 1000),
  ]);
  return getHandoff(input.kind, input.itemId);
}

/** Merges new facts into a tracked item (a later estimate, a changed manager). */
export async function patchHandoff(kind: HandoffKind, itemId: string, patch: { manager?: string; accountName?: string; data?: Record<string, string> }): Promise<void> {
  const sql = getSql();
  await sql.query(
    `UPDATE handoff_items SET
       manager = COALESCE($3, manager),
       account_name = COALESCE($4, account_name),
       title = COALESCE($4, title),
       data = data || $5::jsonb
     WHERE kind = $1 AND item_id = $2`,
    [kind, itemId, patch.manager ?? null, patch.accountName ?? null, JSON.stringify(patch.data ?? {})]
  );
}

/**
 * A new account moves by itself: its step is the first checklist section
 * that still has an unchecked item. Called after every checklist save.
 * Does nothing for an account that is not on the New accounts board.
 */
export async function syncAccountStep(accountId: string, items: OnboardingChecklistItems, by: string): Promise<HandoffItem | null> {
  if (!(await handoffsReady())) return null;
  const current = await getHandoff("account", accountId);
  if (!current) return null;
  const step = currentOnboardingSection(items);
  if (step === current.step) return current;
  return moveHandoff({ kind: "account", itemId: accountId, toStep: step, by, done: step === ACCOUNT_DONE_STEP });
}

/* ---------- Settings -> Team ---------- */

export async function getHandoffSettings(): Promise<HandoffSettings> {
  const sql = getSql();
  const rows = (await sql`SELECT office_owners, red_after_days, onboarding FROM handoff_settings WHERE id`) as {
    office_owners: string[] | null;
    red_after_days: number;
    onboarding: Record<string, OnboardingRule> | null;
  }[];
  const row = rows[0];
  return { officeOwners: row?.office_owners ?? [], redAfterDays: row?.red_after_days ?? 2, onboarding: row?.onboarding ?? {} };
}

export async function saveHandoffSettings(settings: HandoffSettings, by: string): Promise<HandoffSettings> {
  const sql = getSql();
  const owners = Array.from(new Set(settings.officeOwners.map((name) => String(name).trim()).filter(Boolean))).slice(0, 30);
  const days = Math.min(30, Math.max(1, Math.round(Number(settings.redAfterDays) || 2)));
  await sql.query(
    `INSERT INTO handoff_settings (id, office_owners, red_after_days, onboarding, updated_by, updated_at)
     VALUES (true, $1::text[], $2, $3::jsonb, $4, now())
     ON CONFLICT (id) DO UPDATE SET office_owners = EXCLUDED.office_owners, red_after_days = EXCLUDED.red_after_days, onboarding = EXCLUDED.onboarding, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [owners, days, JSON.stringify(settings.onboarding ?? {}), by]
  );
  return getHandoffSettings();
}

/** Who the logged-in person is for handoffs: an Office person, a manager, or the owner. */
export function handoffMe(name: string, role: "manager" | "owner" | "" | undefined, settings: HandoffSettings): HandoffMe {
  const cleanRole = role === "owner" || role === "manager" ? role : "";
  const picked = settings.officeOwners.some((owner) => sameName(owner, name));
  // Until someone is picked in Settings -> Team, the owner stands in for the
  // Office, so an Office step is never waiting on nobody.
  return { name, role: cleanRole, isOffice: picked || (settings.officeOwners.length === 0 && cleanRole === "owner") };
}
