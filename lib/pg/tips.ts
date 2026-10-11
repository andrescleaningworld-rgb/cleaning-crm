// First-time tips a person has seen (table tips_seen, migration 026).
// Until a database has that table, tipsReady() is false and the app keeps
// remembering tips in the browser only, as before.
import { getSql } from "@/lib/db";

/** The row that means "no tips at all for this person". */
const ALL = "*";

let ready: boolean | null = null;

export async function tipsReady(): Promise<boolean> {
  if (ready === true) return true;
  try {
    const rows = (await getSql()`SELECT to_regclass('public.tips_seen') IS NOT NULL AS ok`) as { ok: boolean }[];
    ready = rows[0]?.ok === true;
  } catch {
    ready = false;
  }
  return ready === true;
}

export async function getTips(person: string): Promise<{ seen: string[]; off: boolean }> {
  const rows = (await getSql()`SELECT tip_id FROM tips_seen WHERE person = ${person}`) as { tip_id: string }[];
  const ids = rows.map((row) => row.tip_id);
  return { seen: ids.filter((id) => id !== ALL), off: ids.includes(ALL) };
}

/** Marks tips as seen. Ids are short names of screens; anything else is ignored. */
export async function markTipsSeen(person: string, ids: string[]): Promise<void> {
  const clean = Array.from(new Set(ids.map((id) => id.trim()).filter((id) => /^[a-z0-9-]{1,40}$/.test(id)))).slice(0, 60);
  if (clean.length === 0) return;
  await getSql()`
    INSERT INTO tips_seen (person, tip_id)
    SELECT ${person}, id FROM unnest(${clean}::text[]) AS id
    ON CONFLICT (person, tip_id) DO NOTHING
  `;
}

/** "Skip all" / Settings -> "Don't show tips": true turns every tip off for this person, false turns them back on. */
export async function setTipsOff(person: string, off: boolean): Promise<void> {
  const sql = getSql();
  if (off) await sql`INSERT INTO tips_seen (person, tip_id) VALUES (${person}, ${ALL}) ON CONFLICT (person, tip_id) DO NOTHING`;
  else await sql`DELETE FROM tips_seen WHERE person = ${person} AND tip_id = ${ALL}`;
}
