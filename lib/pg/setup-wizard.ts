// The setup wizard on the server (rules and words in lib/setupWizard.ts).
// Server only. It keeps nothing of its own: it reads and writes the places
// the answers already live (the account's fields, its new-account steps, its
// Contacts, its supplies choice, the checklist's ticks, and the Photos list).
//
// Site survey photos: Blob storage (photos/survey/) + photo_index, kind
// "Site survey", the shot's label in caption and a ~400px copy in thumb_url
// (migration 063). They show in the account's Photos like any other photo.

import { del, put } from "@vercel/blob";
import { getSql } from "@/lib/db";
import { accountsOnPostgres, fetchOnboardingChecklist, setOnboardingChecklistItem } from "@/lib/data/accounts";
import { doneStepsOf, FLOW_STEPS, isFlowStep, type FlowStep } from "@/lib/accountFlow";
import { listContacts, saveContact } from "@/lib/pg/account-contacts";
import { getFeatureSetting } from "@/lib/pg/feature-settings";
import { SPECIAL_EQUIPMENT_ITEM } from "@/lib/onboardingChecklist";
import {
  ANYTHING_ELSE_SHOT,
  TAP_STEPS,
  TICK_KEY,
  setupSummary,
  type SetupFacts,
  type SetupSummary,
  type SetupWizardData,
  type SurveyPhoto,
  type TapStep,
} from "@/lib/setupWizard";

const clean = (value: unknown) => String(value ?? "").trim();
/** A query typed as the rows it returns. */
const typed = async <T,>(query: PromiseLike<unknown>): Promise<T> => (await query) as T;

/** Each check runs once per server instance and is kept once it says yes. */
const seen = new Map<string, boolean>();
async function tableHas(table: string, column?: string): Promise<boolean> {
  const key = `${table}.${column ?? ""}`;
  if (seen.get(key)) return true;
  try {
    const rows = column
      ? ((await getSql()`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}) AS ok`) as { ok: boolean }[])
      : ((await getSql()`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS ok`) as { ok: boolean }[]);
    const ok = rows[0]?.ok === true;
    if (ok) seen.set(key, true);
    return ok;
  } catch {
    return false;
  }
}

/** Site survey photos can be saved: the Photos list with migration 063, and file storage. */
export async function surveyPhotosReady(): Promise<boolean> {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN) && (await tableHas("photo_index", "thumb_url"));
}

/* ---------- reading ---------- */

type AccountRow = {
  id: string;
  frequency: string | null;
  cleaning_days: string | null;
  cleaning_time: string | null;
  sub_pay: string | null;
  scope_of_work: string | null;
  access: string | null;
  phone: string | null;
  start_date: string | null;
};

/** Where an account is in its new-account steps: the step it is on and every step done. */
type FlowState = { step: FlowStep; done: FlowStep[] };

async function flowStates(accountIds: string[]): Promise<Map<string, FlowState>> {
  const out = new Map<string, FlowState>();
  if (accountIds.length === 0 || !(await tableHas("account_flows"))) return out;
  const sql = getSql();
  const [flows, events] = await Promise.all([
    typed<{ account_id: string; step: string }[]>(sql`SELECT account_id, step FROM account_flows WHERE account_id = ANY(${accountIds})`),
    typed<{ account_id: string; step: string; action: string }[]>(sql`
      SELECT account_id, step, action FROM account_flow_events
      WHERE account_id = ANY(${accountIds}) AND action IN ('done', 'undo', 'no', 'back')
      ORDER BY at ASC, id ASC
    `),
  ]);
  for (const flow of flows) {
    const step = isFlowStep(flow.step) ? flow.step : "packet";
    out.set(flow.account_id, { step, done: doneOn(step, doneStepsOf(events.filter((event) => event.account_id === flow.account_id))) });
  }
  return out;
}

/** Before the current step is always done; after it, what was marked done ahead (same as the tracker). */
function doneOn(step: FlowStep, marked: FlowStep[]): FlowStep[] {
  const index = FLOW_STEPS.findIndex((def) => def.key === step);
  return FLOW_STEPS.filter((def, i) => def.key !== "live" && (step === "live" || i < index || marked.includes(def.key))).map((def) => def.key);
}

/**
 * What the wizard counts, for many accounts at once (the board asks for every
 * new-account pin). `flows` can be passed when the caller already has the
 * steps (the board does). Accounts not found are left out.
 */
export async function setupFactsFor(accountIds: string[], flows?: Map<string, FlowState>): Promise<Map<string, SetupFacts>> {
  const ids = [...new Set(accountIds.map(clean).filter(Boolean))];
  const out = new Map<string, SetupFacts>();
  if (ids.length === 0 || !accountsOnPostgres()) return out;
  const sql = getSql();
  const [accounts, steps, modes, ticks, photos] = await Promise.all([
    // cleaning_time (migration 050) through to_jsonb, so this reads the same before it.
    typed<AccountRow[]>(sql`
      SELECT a.id, a.frequency, a.cleaning_days, COALESCE(to_jsonb(a) ->> 'cleaning_time', '') AS cleaning_time,
             COALESCE(NULLIF(btrim(a.monthly_sub_pay_raw), ''), a.monthly_sub_pay::text, '') AS sub_pay,
             a.scope_of_work, a.key_alarm_access_info AS access, a.phone,
             COALESCE(to_char(a.start_date, 'YYYY-MM-DD'), a.start_date_raw, '') AS start_date
      FROM accounts a WHERE a.id = ANY(${ids})
    `),
    flows ? Promise.resolve(flows) : flowStates(ids),
    (async () => ((await tableHas("supply_account_modes")) ? ((await sql`SELECT account_id, mode FROM supply_account_modes WHERE account_id = ANY(${ids})`) as { account_id: string; mode: string }[]) : []))(),
    typed<{ account_id: string; items_raw: string }[]>(sql`SELECT account_id, items_raw FROM onboarding_checklists WHERE btrim(account_id) = ANY(${ids})`),
    (async () =>
      (await tableHas("photo_index", "thumb_url"))
        ? ((await sql`SELECT account_id, count(*)::int AS n FROM photo_index WHERE kind = 'Site survey' AND account_id = ANY(${ids}) GROUP BY account_id`) as { account_id: string; n: number }[])
        : [])(),
  ]);
  for (const row of accounts) {
    const id = clean(row.id);
    const mode = modes.find((entry) => entry.account_id === id)?.mode ?? "";
    out.set(id, {
      flow: steps.get(id) ?? null,
      ticks: ticksOf(ticks.find((entry) => clean(entry.account_id) === id)?.items_raw ?? ""),
      frequency: clean(row.frequency),
      cleaningDays: clean(row.cleaning_days),
      cleaningTime: clean(row.cleaning_time),
      subPay: clean(row.sub_pay),
      scopeOfWork: clean(row.scope_of_work),
      access: clean(row.access),
      phone: clean(row.phone),
      startDate: clean(row.start_date).slice(0, 10),
      supplyMode: mode === "included" || mode === "billed" || mode === "customer" ? mode : "",
      surveyPhotos: photos.find((entry) => entry.account_id === id)?.n ?? 0,
    });
  }
  return out;
}

function ticksOf(raw: string): Record<TapStep, boolean> {
  const out: Record<TapStep, boolean> = { call: false, survey: false, walkthrough: false };
  try {
    const items = JSON.parse(raw || "{}") as Record<string, { checked?: unknown }>;
    for (const step of TAP_STEPS) out[step] = items[TICK_KEY[step]]?.checked === true;
  } catch {
    // A broken value counts as nothing ticked.
  }
  return out;
}

/** The pins' "X of Y done" and "Ready to start", per account. */
export async function setupSummariesFor(accountIds: string[], flows?: Map<string, FlowState>): Promise<Map<string, SetupSummary>> {
  const facts = await setupFactsFor(accountIds, flows);
  return new Map([...facts].map(([id, each]) => [id, setupSummary(each)]));
}

export async function getSetupWizard(accountId: string): Promise<SetupWizardData | null> {
  const id = clean(accountId);
  const facts = (await setupFactsFor([id])).get(id);
  if (!facts) return null;
  const sql = getSql();
  const [rows, checklist, contacts, photosOn, shots] = await Promise.all([
    typed<{ account_name: string; monthly_revenue_raw: string; sub_price_per_cleaning: string | number | null; has_key: string; contact_name: string; email: string; time_ready: boolean }[]>(sql`
      SELECT account_name, monthly_revenue_raw, sub_price_per_cleaning, has_key, contact_name, email, (to_jsonb(accounts) ? 'cleaning_time') AS time_ready
      FROM accounts WHERE id = ${id} LIMIT 1
    `),
    fetchOnboardingChecklist(id).catch(() => null),
    listContacts(id).catch(() => null),
    surveyPhotosReady(),
    getFeatureSetting("surveyShots").catch(() => null),
  ]);
  const row = rows[0];
  const billing = (contacts ?? []).find((contact) => !contact.isMain && contact.role.toLowerCase() === "billing");
  const photos = photosOn
    ? ((await sql`
        SELECT id, url, thumb_url, caption FROM photo_index
        WHERE kind = 'Site survey' AND account_id = ${id}
        ORDER BY taken_at ASC, id ASC
      `) as { id: number | string; url: string; thumb_url: string; caption: string }[])
    : [];
  return {
    accountId: id,
    accountName: clean(row?.account_name),
    facts,
    values: {
      monthlyRevenue: clean(row?.monthly_revenue_raw),
      subPricePerCleaning: row?.sub_price_per_cleaning == null ? "" : Number(row.sub_price_per_cleaning).toFixed(2),
      hasKey: clean(row?.has_key),
      contactName: clean(row?.contact_name),
      email: clean(row?.email),
      specialEquipment: clean(checklist?.items[SPECIAL_EQUIPMENT_ITEM]?.note),
      billingName: clean(billing?.name),
      billingEmail: clean(billing?.email),
    },
    cleaningTimeReady: row?.time_ready === true,
    photosReady: photosOn,
    photos: photos.map((photo) => ({ id: Number(photo.id), url: photo.url, thumbUrl: clean(photo.thumb_url) || photo.url, label: clean(photo.caption) })),
    shots: [...(shots?.labels ?? []), ANYTHING_ELSE_SHOT],
  };
}

/* ---------- writing ---------- */

/** An older account (no new-account steps): its Yes tap is a tick in the checklist. */
export async function setTick(accountId: string, accountName: string, step: TapStep, done: boolean): Promise<void> {
  await setOnboardingChecklistItem({ accountId, accountName, itemKey: TICK_KEY[step], checked: done, note: "" });
}

export async function setSpecialEquipment(accountId: string, accountName: string, note: string): Promise<void> {
  const text = note.trim().slice(0, 1000);
  await setOnboardingChecklistItem({ accountId, accountName, itemKey: SPECIAL_EQUIPMENT_ITEM, checked: text !== "", note: text });
}

/**
 * The billing contact (if different): a contact with the role "Billing" on
 * the account's Contacts. An empty name and email leave it as it is.
 */
export async function setBillingContact(accountId: string, name: string, email: string, by: string): Promise<void> {
  const contacts = await listContacts(accountId);
  if (contacts === null) throw new Error("Contacts are not set up in this database yet, so the billing contact cannot be saved.");
  const billing = contacts.find((contact) => !contact.isMain && contact.role.toLowerCase() === "billing");
  if (!name.trim() && !email.trim()) return;
  const input = { name: name.trim(), role: "Billing", phone: billing?.phone ?? "", email: email.trim(), notes: billing?.notes ?? "" };
  await saveContact(accountId, billing?.id ?? null, input, by, false);
}

/* ---------- site survey photos ---------- */

const MAX_BYTES = 8 * 1024 * 1024;

/** One shot: the full photo and its small copy (both already made small in the browser). */
export async function addSurveyPhoto(input: { accountId: string; accountName: string; label: string; full: File; thumb: File | null; by: string }): Promise<SurveyPhoto> {
  if (!(await surveyPhotosReady())) throw new Error("Photos can be saved here once the database update (migration 063) and file storage are in.");
  if (!/^image\//i.test(input.full.type)) throw new Error("That is not a photo.");
  if (input.full.size > MAX_BYTES || (input.thumb && input.thumb.size > MAX_BYTES)) throw new Error("That photo is too big.");
  const label = input.label.trim().slice(0, 60) || ANYTHING_ELSE_SHOT;
  const name = crypto.randomUUID();
  const full = await put(`photos/survey/${name}.jpg`, input.full, { access: "public", contentType: input.full.type || "image/jpeg", addRandomSuffix: false });
  const thumb = input.thumb ? await put(`photos/survey/${name}-thumb.jpg`, input.thumb, { access: "public", contentType: input.thumb.type || "image/jpeg", addRandomSuffix: false }) : null;
  const rows = (await getSql()`
    INSERT INTO photo_index (source_key, store, url, account_id, account_name, kind, moment, linked_type, linked_id, linked_label, linked_href, taken_by, taken_at, is_image, caption, thumb_url)
    VALUES (${`survey:${name}`}, 'blob', ${full.url}, ${input.accountId}, ${input.accountName}, 'Site survey', '', 'account', ${input.accountId}, 'Open the account',
            ${`/accounts/${input.accountId}`}, ${input.by}, now(), true, ${label}, ${thumb?.url ?? ""})
    RETURNING id
  `) as { id: number | string }[];
  return { id: Number(rows[0]?.id), url: full.url, thumbUrl: thumb?.url ?? full.url, label };
}

/** A wrong shot: off the Photos list, and its files out of storage. Only a site survey photo of this account. */
export async function deleteSurveyPhoto(accountId: string, photoId: number): Promise<void> {
  const rows = (await getSql()`
    DELETE FROM photo_index WHERE id = ${photoId} AND account_id = ${accountId} AND kind = 'Site survey' AND source_key LIKE 'survey:%'
    RETURNING url, thumb_url
  `) as { url: string; thumb_url: string }[];
  if (rows.length === 0) throw new Error("That photo is already gone.");
  const files = [rows[0].url, rows[0].thumb_url].filter(Boolean);
  // The row is gone, so the photo no longer shows; a file left behind only takes space.
  await del(files).catch((error) => console.error("[setup-wizard] photo file not deleted:", error instanceof Error ? error.message : error));
}
