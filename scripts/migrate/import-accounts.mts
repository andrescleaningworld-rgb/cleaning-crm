// Area 4 import: Accounts, OnboardingChecklist, Account Updates, Sub Transfer
// Proposals → Postgres (dev branch only; Sheets read-only).
//
//   npx tsx scripts/migrate/import-accounts.mts --dry-run
//   npx tsx scripts/migrate/import-accounts.mts
//
// (.mts so it can use the app's own sub-name matching, lib/subAccountMatching.ts.)
// Run import-people and import-subs first: accounts point at managers and
// subcontractors. Safe to re-run. Never deletes; nothing is merged.
//
// Overrides (migration_overrides, area 'accounts'):
//   kind 'account_sub'      legacy_key = the Subcontractor text as typed (lowercase), resolved_id = sub id
//   kind 'account_manager'  legacy_key = the Manager text as typed (lowercase),       resolved_id = managers.manager_id
import { normalizeSubName, resolveAssignedSubKeyWithCandidateCount } from "../../lib/subAccountMatching";
import { isBlankRow, readTab } from "./lib/sheets-readonly.mjs";
import { cell, compareKeys, dedupe, existingKeys, sha256, startRun, toDate, toTimestamp, upsertRows } from "./lib/import-helpers.mjs";

const dryRun = process.argv.includes("--dry-run");
const run = await startRun("accounts", { dryRun });
const { sql } = run;

const norm = (text: unknown) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
/** "$1,234.50" → "1234.50"; blank or not a number → null. */
const toMoney = (raw: string): string | null => {
  const cleaned = raw.replace(/[$,\s]/g, "");
  return cleaned !== "" && !Number.isNaN(Number(cleaned)) ? Number(cleaned).toFixed(2) : null;
};
const toNumber = (raw: string): number | null => (raw.trim() !== "" && !Number.isNaN(Number(raw)) ? Number(raw) : null);

type Row = { row: string[]; sourceRow: number };
async function dataRows(sheet: string, tab: string, range: string): Promise<{ rows: Row[]; blank: number }> {
  const all = ((await readTab(sheet, tab, { range })) as string[][]).slice(1).map((row, i) => ({ row, sourceRow: i + 2 }));
  const kept = all.filter(({ row }) => !isBlankRow(row));
  return { rows: kept, blank: all.length - kept.length };
}

/** Groups issues that would repeat per row into one question per distinct value. */
function grouped<T>() {
  const map = new Map<string, { count: number; extra: T }>();
  return {
    add(key: string, extra: T) {
      const entry = map.get(key) ?? { count: 0, extra };
      entry.count++;
      map.set(key, entry);
    },
    entries: () => [...map],
  };
}

try {
  /* ---------- lookups ---------- */
  const subs = (await sql`SELECT id, contact_name, company_name FROM subcontractors`) as { id: string; contact_name: string; company_name: string }[];
  const subEntries = subs.map((s) => ({ key: s.id, company: normalizeSubName(s.company_name), contact: normalizeSubName(s.contact_name) }));
  const managers = (await sql`SELECT id, manager_id, name FROM managers`) as { id: number; manager_id: string; name: string }[];
  const overrides = (await sql`SELECT kind, legacy_key, resolved_id FROM migration_overrides WHERE area = 'accounts'`) as { kind: string; legacy_key: string; resolved_id: string | null }[];
  const subOverride = new Map(overrides.filter((o) => o.kind === "account_sub").map((o) => [norm(o.legacy_key), o.resolved_id]));
  const managerOverride = new Map(overrides.filter((o) => o.kind === "account_manager").map((o) => [norm(o.legacy_key), o.resolved_id]));

  /* ---------- Accounts ---------- */
  const accountsTab = await dataRows("MAIN", "Accounts", "A:AI");
  const unresolvedSubs = grouped<{ candidates: number }>();
  const unresolvedManagers = grouped<{ why: string }>();
  let subResolved = 0;
  let managerResolved = 0;

  const accountRecords = accountsTab.rows.map(({ row, sourceRow }) => {
    const id = cell(row, 0).trim();
    const name = cell(row, 1);
    const legacyKey = id || sha256("account-without-id", name.trim(), cell(row, 11).trim(), cell(row, 2).trim());
    if (!id) run.issue("accounts", legacyKey, `Row ${sourceRow} has no Account ID. Kept, without an ID. What should its ID be?`);

    // Subcontractor: the app's own rule, so the link means what the screens
    // already show. Exact company/contact match wins; a looser match counts
    // only when it fits exactly one sub; otherwise nobody.
    const subRaw = cell(row, 8);
    let subId: string | null = null;
    if (subRaw.trim()) {
      if (subOverride.has(norm(subRaw))) {
        subId = subOverride.get(norm(subRaw)) ?? null;
      } else {
        const resolved = resolveAssignedSubKeyWithCandidateCount(subRaw, subEntries);
        subId = resolved.key || null;
        if (!subId) unresolvedSubs.add(subRaw.trim(), { candidates: resolved.candidateCount });
      }
      if (subId) subResolved++;
    }

    // Manager: exact name only (case and spaces ignored). "Andres , Greg"
    // or an accent the Managers tab does not have is a question, not a guess.
    const managerRaw = cell(row, 9);
    let managerPk: number | null = null;
    if (managerRaw.trim()) {
      if (managerOverride.has(norm(managerRaw))) {
        managerPk = managers.find((m) => m.manager_id === managerOverride.get(norm(managerRaw)))?.id ?? null;
      } else {
        const hits = managers.filter((m) => norm(m.name) === norm(managerRaw));
        if (hits.length === 1) managerPk = hits[0].id;
        else unresolvedManagers.add(managerRaw.trim(), { why: hits.length > 1 ? "fits more than one manager" : "is not a name in the Managers list" });
      }
      if (managerPk) managerResolved++;
    }

    const money = (index: number, label: string) => {
      const raw = cell(row, index);
      const value = toMoney(raw);
      if (raw.trim() && value === null) run.issue("accounts", legacyKey, `${label} is not a number. Kept as text; no amount stored.`);
      return value;
    };
    const date = (index: number, label: string) => {
      const raw = cell(row, index);
      const value = toDate(raw);
      if (raw.trim() && !value) run.issue("accounts", legacyKey, `${label} is not a date the import understands. Kept as text.`);
      return value;
    };

    return {
      id: id || null,
      legacy_key: legacyKey,
      account_name: name,
      start_date: date(2, "Start Date"),
      start_date_raw: cell(row, 2),
      service_type: cell(row, 3),
      frequency: cell(row, 4),
      cleaning_days: cell(row, 5),
      key_alarm_access_info: cell(row, 6),
      monthly_revenue: money(7, "Monthly Revenue"),
      monthly_revenue_raw: cell(row, 7),
      subcontractor_id: subId,
      subcontractor_raw: subRaw,
      manager_id: managerPk,
      manager_raw: managerRaw,
      monthly_sub_pay: money(10, "Monthly Subcontractor Pay"),
      monthly_sub_pay_raw: cell(row, 10),
      address: cell(row, 11),
      contact_name: cell(row, 12),
      phone: cell(row, 13),
      scope_of_work: cell(row, 14),
      notes: cell(row, 15),
      status: cell(row, 16),
      status_key: norm(cell(row, 16)),
      cancelled_date: date(17, "Cancelled Date"),
      cancelled_date_raw: cell(row, 17),
      last_updated_raw: cell(row, 18),
      account_health: cell(row, 19),
      email: cell(row, 20),
      gross_margin: money(21, "Gross Margin"),
      gross_margin_raw: cell(row, 21),
      gross_margin_pct_raw: cell(row, 22),
      last_visit_date_raw: cell(row, 23),
      last_complaint_date_raw: cell(row, 24),
      last_follow_up_date_raw: cell(row, 25),
      open_complaints_raw: cell(row, 26),
      open_inactive_notes: cell(row, 27),
      latitude: toNumber(cell(row, 28)),
      latitude_raw: cell(row, 28),
      longitude: toNumber(cell(row, 29)),
      longitude_raw: cell(row, 29),
      has_key: cell(row, 30),
      alarm_code: cell(row, 31),
      city: cell(row, 32),
      zip: cell(row, 33),
      checklist_needed: cell(row, 34),
      source_sheet: "MAIN",
      source_row: sourceRow,
    };
  });

  for (const [raw, { count, extra }] of unresolvedSubs.entries()) {
    run.issue(
      "accounts",
      `sub:${norm(raw)}`,
      extra.candidates > 1
        ? `${count} accounts say their subcontractor is "${raw}", which fits ${extra.candidates} subcontractors. Which one is it? Left unlinked (the app also shows these accounts under no sub).`
        : `${count} accounts say their subcontractor is "${raw}", which fits no subcontractor in the list. Who is it? Left unlinked.`,
      { rawValue: raw }
    );
  }
  for (const [raw, { count, extra }] of unresolvedManagers.entries()) {
    run.issue("accounts", `manager:${norm(raw)}`, `${count} accounts say their manager is "${raw}", which ${extra.why}. Who manages them? Left unlinked.`, { rawValue: raw });
  }

  const accounts = dedupe(run, "accounts", accountRecords);
  const duplicateNames = new Map<string, number>();
  for (const a of accounts) if (norm(a.account_name)) duplicateNames.set(norm(a.account_name), (duplicateNames.get(norm(a.account_name)) ?? 0) + 1);
  for (const [name, count] of duplicateNames) {
    if (count > 1) run.issue("accounts", `name:${name}`, `${count} accounts share one name. Other tabs find an account by name, so they cannot tell these apart. Same place entered twice, or different places?`, { rawValue: name });
  }
  for (const a of accounts) if (!a.account_name.trim()) run.issue("accounts", a.legacy_key, `Row ${a.source_row} has no Account Name.`);
  const statuses = new Map<string, number>();
  for (const a of accounts) statuses.set(a.status.trim(), (statuses.get(a.status.trim()) ?? 0) + 1);
  for (const [status, count] of statuses) {
    if (!["active", "cancelled", "paused", "inactive"].includes(status.toLowerCase())) {
      run.issue("accounts", `status:${norm(status) || "(blank)"}`, `${count} accounts have the status "${status}", which is not Active, Cancelled, Paused or Inactive. Kept as is.`, { rawValue: status });
    }
  }

  const accountDiff = compareKeys(run, "accounts", accounts.map((a) => a.legacy_key), await existingKeys(sql, "accounts"));
  if (!dryRun) await upsertRows(sql, "accounts", accounts);
  run.count("accounts", {
    sheetRows: accountsTab.rows.length,
    blank: accountsTab.blank,
    imported: accounts.length,
    ...accountDiff,
    withSubName: accounts.filter((a) => a.subcontractor_raw.trim()).length,
    subLinked: subResolved,
    withManagerName: accounts.filter((a) => a.manager_raw.trim()).length,
    managerLinked: managerResolved,
  });

  // Account lookups for the other tabs: by ID and by exact name (unique only).
  const accountRows = dryRun
    ? []
    : ((await sql`SELECT pk, id, account_name FROM accounts`) as { pk: number; id: string | null; account_name: string }[]);
  const byId = new Map(accountRows.filter((a) => a.id).map((a) => [a.id as string, a.pk]));
  const byName = new Map<string, number[]>();
  for (const a of accountRows) if (norm(a.account_name)) byName.set(norm(a.account_name), [...(byName.get(norm(a.account_name)) ?? []), a.pk]);
  const accountByName = (name: string): number | null => {
    const hits = byName.get(norm(name)) ?? [];
    return hits.length === 1 ? hits[0] : null;
  };

  /* ---------- OnboardingChecklist ---------- */
  const onboardingTab = await dataRows("MAIN", "OnboardingChecklist", "A:G");
  const onboarding = dedupe(
    run,
    "onboarding_checklists",
    onboardingTab.rows.flatMap(({ row, sourceRow }) => {
      const accountId = cell(row, 0).trim();
      if (!accountId) {
        run.issue("onboarding_checklists", `row-${sourceRow}`, `Row ${sourceRow} has no AccountId. Skipped.`);
        return [];
      }
      let items: unknown = {};
      try {
        items = JSON.parse(cell(row, 2) || "{}");
      } catch {
        run.issue("onboarding_checklists", accountId, "ItemsJson is not valid JSON. Kept as text; the checklist shows empty.");
      }
      if (!dryRun && !byId.has(accountId)) run.issue("onboarding_checklists", accountId, `Checklist for Account ID ${accountId}, which is not in Accounts.`);
      return [
        {
          account_id: accountId,
          legacy_key: accountId,
          account_name: cell(row, 1),
          items: JSON.stringify(items),
          items_raw: cell(row, 2),
          started_at: toTimestamp(cell(row, 3)),
          started_at_raw: cell(row, 3),
          last_updated_at: toTimestamp(cell(row, 4)),
          last_updated_at_raw: cell(row, 4),
          completed_at: toTimestamp(cell(row, 5)),
          completed_at_raw: cell(row, 5),
          auto_stable_applied_at: toTimestamp(cell(row, 6)),
          auto_stable_applied_at_raw: cell(row, 6),
          source_sheet: "MAIN",
          source_row: sourceRow,
        },
      ];
    })
  );
  const onboardingDiff = compareKeys(run, "onboarding_checklists", onboarding.map((r) => r.legacy_key), await existingKeys(sql, "onboarding_checklists"));
  if (!dryRun) await upsertRows(sql, "onboarding_checklists", onboarding);
  run.count("onboarding_checklists", { sheetRows: onboardingTab.rows.length, imported: onboarding.length, ...onboardingDiff });

  /* ---------- Account Updates ---------- */
  // Columns A and B are row-numbering formulas, so the key is the content.
  // Identical notes on the same account and day are two real notes: the nth
  // copy gets "#n".
  const updatesTab = await dataRows("MAIN", "Account Updates", "A:Q");
  const seenUpdates = new Map<string, number>();
  const updatesUnlinked = grouped<null>();
  let updatesLinked = 0;
  const updates = updatesTab.rows.flatMap(({ row, sourceRow }) => {
    // The formulas put text in A/B on rows where only they have a value.
    if (isBlankRow(row.slice(2))) return [];
    const base = sha256("update", norm(cell(row, 2)), cell(row, 3).trim(), cell(row, 4).trim(), cell(row, 5).trim());
    const n = (seenUpdates.get(base) ?? 0) + 1;
    seenUpdates.set(base, n);
    const accountPk = accountByName(cell(row, 2));
    if (accountPk) updatesLinked++;
    else if (!dryRun) updatesUnlinked.add(cell(row, 2).trim() || "(blank)", null);
    const dateRaw = cell(row, 3);
    return [
      {
        legacy_key: n === 1 ? base : `${base}#${n}`,
        update_id_raw: cell(row, 0),
        account_id_raw: cell(row, 1),
        account_pk: accountPk,
        account_name: cell(row, 2),
        update_date: toDate(dateRaw),
        update_date_raw: dateRaw,
        update_type: cell(row, 4),
        notes: cell(row, 5),
        created_by: cell(row, 6),
        notify_email: cell(row, 7),
        created_at_raw: cell(row, 8),
        updated_at_raw: cell(row, 9),
        update_title: cell(row, 10),
        details: cell(row, 11),
        entered_by: cell(row, 12),
        notify_office: cell(row, 13),
        notify_subcontractor: cell(row, 14),
        follow_up_needed: cell(row, 15),
        follow_up_date_raw: cell(row, 16),
        source_sheet: "MAIN",
        source_row: sourceRow,
      },
    ];
  });
  for (const [name, { count }] of updatesUnlinked.entries()) {
    run.issue("account_updates", `account:${norm(name)}`, `${count} notes are for "${name}", which is not the exact name of exactly one account. Which account are they for? Left unlinked.`, { rawValue: name });
  }
  const updatesDiff = compareKeys(run, "account_updates", updates.map((r) => r.legacy_key), await existingKeys(sql, "account_updates"));
  if (!dryRun) await upsertRows(sql, "account_updates", updates);
  run.count("account_updates", { sheetRows: updates.length, blank: updatesTab.blank, imported: updates.length, ...updatesDiff, linkedToAccount: updatesLinked });

  /* ---------- Sub Transfer Proposals ---------- */
  const proposalsTab = await dataRows("MAIN", "Sub Transfer Proposals", "A:O");
  const subByEmail = new Map<string, string[]>();
  for (const s of (await sql`SELECT id, email FROM subcontractors WHERE email <> ''`) as { id: string; email: string }[]) {
    subByEmail.set(norm(s.email), [...(subByEmail.get(norm(s.email)) ?? []), s.id]);
  }
  const seenProposals = new Map<string, number>();
  let proposalsSubLinked = 0;
  let proposalsAccountLinked = 0;
  const proposals = proposalsTab.rows.map(({ row, sourceRow }) => {
    const base = sha256("proposal", cell(row, 0).trim(), norm(cell(row, 5)), norm(cell(row, 6)));
    const n = (seenProposals.get(base) ?? 0) + 1;
    seenProposals.set(base, n);
    const subHits = subByEmail.get(norm(cell(row, 4))) ?? [];
    const accountPk = accountByName(cell(row, 5));
    if (subHits.length === 1) proposalsSubLinked++;
    if (accountPk) proposalsAccountLinked++;
    return {
      legacy_key: n === 1 ? base : `${base}#${n}`,
      proposal_id: cell(row, 0),
      created_at_raw: cell(row, 1),
      status: cell(row, 2),
      new_subcontractor: cell(row, 3),
      new_subcontractor_email: cell(row, 4),
      new_subcontractor_id: subHits.length === 1 ? subHits[0] : null,
      account_name: cell(row, 5),
      account_pk: accountPk,
      address: cell(row, 6),
      cleaning_days: cell(row, 7),
      scope: cell(row, 8),
      keys_alarm: cell(row, 9),
      proposed_monthly_pay: toMoney(cell(row, 10)),
      proposed_monthly_pay_raw: cell(row, 10),
      accepted_at_raw: cell(row, 11),
      declined_at_raw: cell(row, 12),
      notes: cell(row, 13),
      sent_at_raw: cell(row, 14),
      source_sheet: "MAIN",
      source_row: sourceRow,
    };
  });
  const proposalsDiff = compareKeys(run, "sub_transfer_proposals", proposals.map((r) => r.legacy_key), await existingKeys(sql, "sub_transfer_proposals"));
  if (!dryRun) await upsertRows(sql, "sub_transfer_proposals", proposals);
  run.count("sub_transfer_proposals", {
    sheetRows: proposalsTab.rows.length,
    imported: proposals.length,
    ...proposalsDiff,
    proposals: new Set(proposals.map((p) => p.proposal_id)).size,
    subLinked: proposalsSubLinked,
    accountLinked: proposalsAccountLinked,
  });

  await run.finish("ok");
} catch (error) {
  console.error("Import failed:", error);
  await run.finish("failed").catch(() => undefined);
  process.exitCode = 1;
}
