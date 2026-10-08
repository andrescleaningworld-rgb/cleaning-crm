// Area 4 verify: Accounts, OnboardingChecklist, Account Updates, Sub Transfer
// Proposals, Sheets vs Postgres (dev). Read-only. Counts only; no cell values
// (these tabs hold key codes, revenue and pay).
//   node scripts/migrate/verify-accounts.mjs
import { cell, sha256 } from "./lib/import-helpers.mjs";
import { runVerify } from "./lib/verify-helpers.mjs";

const norm = (text) => String(text ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const money = (raw) => {
  const cleaned = String(raw ?? "").replace(/[$,\s]/g, "");
  return cleaned !== "" && !Number.isNaN(Number(cleaned)) ? Number(cleaned) : 0;
};
// The nth identical row gets "#n" on its key, same as the import.
const counter = () => {
  const seen = new Map();
  return (base) => {
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}#${n}`;
  };
};
const updateKey = counter();
const proposalKey = counter();

const ACCOUNT_COLUMNS = [
  "account_name", "start_date_raw", "service_type", "frequency", "cleaning_days", "key_alarm_access_info", "monthly_revenue_raw",
  "subcontractor_raw", "manager_raw", "monthly_sub_pay_raw", "address", "contact_name", "phone", "scope_of_work", "notes", "status",
  "cancelled_date_raw", "last_updated_raw", "account_health", "email", "gross_margin_raw", "gross_margin_pct_raw", "last_visit_date_raw",
  "last_complaint_date_raw", "last_follow_up_date_raw", "open_complaints_raw", "open_inactive_notes", "latitude_raw", "longitude_raw",
  "has_key", "alarm_code", "city", "zip", "checklist_needed",
];

await runVerify("accounts", [
  {
    table: "accounts",
    sheet: "MAIN",
    tab: "Accounts",
    range: "A:AI",
    key: (r) => cell(r, 0).trim() || sha256("account-without-id", cell(r, 1).trim(), cell(r, 11).trim(), cell(r, 2).trim()),
    // Column B onward, in sheet order: index 1 is account_name, … index 34 is checklist_needed.
    fields: Object.fromEntries(ACCOUNT_COLUMNS.map((column, i) => [column, (r) => cell(r, i + 1)])),
    statusColumn: "status_key",
    dateColumn: "start_date",
    sumColumn: "monthly_revenue",
    sheetSum: (r) => money(cell(r, 7)),
  },
  {
    table: "onboarding_checklists",
    sheet: "MAIN",
    tab: "OnboardingChecklist",
    range: "A:G",
    key: (r) => cell(r, 0).trim(),
    keep: (r) => cell(r, 0).trim() !== "",
    fields: {
      account_name: (r) => cell(r, 1),
      items_raw: (r) => cell(r, 2),
      started_at_raw: (r) => cell(r, 3),
      last_updated_at_raw: (r) => cell(r, 4),
      completed_at_raw: (r) => cell(r, 5),
      auto_stable_applied_at_raw: (r) => cell(r, 6),
    },
    dateColumn: "started_at",
  },
  {
    table: "account_updates",
    sheet: "MAIN",
    tab: "Account Updates",
    range: "A:Q",
    keep: (r) => r.slice(2).some((c) => String(c ?? "").trim() !== ""),
    key: (r) => updateKey(sha256("update", norm(cell(r, 2)), cell(r, 3).trim(), cell(r, 4).trim(), cell(r, 5).trim())),
    fields: {
      update_id_raw: (r) => cell(r, 0),
      account_id_raw: (r) => cell(r, 1),
      account_name: (r) => cell(r, 2),
      update_date_raw: (r) => cell(r, 3),
      update_type: (r) => cell(r, 4),
      notes: (r) => cell(r, 5),
      created_by: (r) => cell(r, 6),
      notify_email: (r) => cell(r, 7),
      notify_office: (r) => cell(r, 13),
      notify_subcontractor: (r) => cell(r, 14),
      follow_up_needed: (r) => cell(r, 15),
    },
    statusColumn: "created_by",
    dateColumn: "update_date",
  },
  {
    table: "sub_transfer_proposals",
    sheet: "MAIN",
    tab: "Sub Transfer Proposals",
    range: "A:O",
    key: (r) => proposalKey(sha256("proposal", cell(r, 0).trim(), norm(cell(r, 5)), norm(cell(r, 6)))),
    fields: {
      proposal_id: (r) => cell(r, 0),
      created_at_raw: (r) => cell(r, 1),
      status: (r) => cell(r, 2),
      new_subcontractor: (r) => cell(r, 3),
      new_subcontractor_email: (r) => cell(r, 4),
      account_name: (r) => cell(r, 5),
      address: (r) => cell(r, 6),
      cleaning_days: (r) => cell(r, 7),
      scope: (r) => cell(r, 8),
      keys_alarm: (r) => cell(r, 9),
      proposed_monthly_pay_raw: (r) => cell(r, 10),
      accepted_at_raw: (r) => cell(r, 11),
      declined_at_raw: (r) => cell(r, 12),
      notes: (r) => cell(r, 13),
      sent_at_raw: (r) => cell(r, 14),
    },
    statusColumn: "status",
    sumColumn: "proposed_monthly_pay",
    sheetSum: (r) => money(cell(r, 10)),
  },
]);
