// Sub Transfer Proposals on Postgres (DATA_SOURCE_SUB_TRANSFERS=postgres).
//
// A line-by-line rebuild of what Apps Script did (docs/apps-script/Code.gs:
// createSubTransferProposal, sendSubTransferProposalEmail,
// getSubTransferProposals, markSubTransferProposalSent,
// respondSubTransferProposal, and the updateSubTransferProposalStatus branch
// of doPost). Same answers, same email words and layout, same statuses.
// What is different, because it has to be:
//   - the Accept / Decline links in the email open this app
//     (/api/sub-transfer-response), not the Apps Script web app;
//   - emails are not also written to the "Email Log" sheet.
//   - the list shows each proposal's real pay. The script's list always said
//     0 (and its office notice "-"), because the sheet's column is spelled
//     "Proposed Montly Pay" and the script looked for "Monthly".
// One thing is kept exactly as it was, on purpose: Accept or Decline marks
// EVERY account of the proposal, even though each account has its own
// buttons. That is what the script did (it never looked at the account name).
//
// The table is sub_transfer_proposals (migration 005): one row per account
// of a proposal. Rows copied from the sheet keep the sheet's own text for
// their dates; rows saved here store the moment as an ISO time.
import { getSql } from "@/lib/db";
import { findSubcontractorEmailByName } from "@/app/api/subcontractors/route";
import { getAccountsAppsScriptShape } from "@/lib/data/accounts";
import { sendHtmlEmail } from "@/lib/email";

const LOGO_URL = "https://cleaning-crm-xi.vercel.app/cw-logo.jpg";
const RESPONSE_NOTICE_TO = ["info@cleaningworldinc.com", "crm@cleaningworldinc.com"];
const SENDER_NAME = "Cleaning World App";

type Body = Record<string, unknown>;
type TransferAccount = { accountId: string; accountName: string; address: string; cleaningDays: string; scope: string; keysAlarm: string; proposedMonthlyPay: number };

const text = (value: unknown) => String(value || "").trim();

function parseMoney(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  if (typeof value === "number") return Number.isNaN(value) ? 0 : value;
  const parsed = Number(String(value).replace(/\$/g, "").replace(/,/g, "").trim());
  return Number.isNaN(parsed) ? 0 : parsed;
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** "Yes" when any of the key / alarm fields says so, as the script decided it. */
function keysAlarmYesNo(account: Body): string {
  const values = [account.keysAlarmRequired, account.keysAlarm, account.hasKey, account.alarmCode, account.keyAlarmAccessInfo].map((value) => text(value).toLowerCase()).filter(String);
  if (values.length === 0) return "No";
  const combined = values.join(" ");
  return ["yes", "key", "alarm", "code", "has"].some((word) => combined.includes(word)) ? "Yes" : "No";
}

const accountIdOf = (account: Body) => text(account.accountId || account.id || account.rowNumber || account.accountName);
const accountKey = (value: unknown) =>
  String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .trim();

/** The accounts of a proposal: the ones sent with it, or (older callers) found by name. */
async function accountsFromBody(body: Body): Promise<TransferAccount[]> {
  if (Array.isArray(body.accounts) && body.accounts.length > 0) {
    return (body.accounts as Body[]).map((account) => ({
      accountId: accountIdOf(account),
      accountName: text(account.accountName || account.name),
      address: text(account.address),
      cleaningDays: text(account.cleaningDays || account.frequency),
      scope: text(account.scope || account.scopeOfWork || account.serviceType),
      keysAlarm: keysAlarmYesNo(account),
      proposedMonthlyPay: parseMoney(account.proposedMonthlyPay || account.proposedPay || account.monthlySubcontractorPay || account.subcontractorPay),
    }));
  }

  const wanted = String(body.accountNames || "")
    .split(",")
    .map(accountKey)
    .filter(String);
  const found: Body[] = [];
  if (wanted.length > 0) {
    for (const account of (await getAccountsAppsScriptShape("getAllAccounts")) as Body[]) {
      const key = accountKey(account.accountName);
      if (!key) continue;
      if (wanted.some((name) => key === name || key.includes(name) || name.includes(key)) && !found.some((entry) => entry.accountName === account.accountName)) found.push(account);
    }
  }
  if (found.length === 0) throw new Error("No accounts selected or matching accounts found.");
  const payPerAccount = parseMoney(body.proposedTotalSubPay) / found.length;
  return found.map((account) => ({
    accountId: accountIdOf(account),
    accountName: text(account.accountName),
    address: text(account.address),
    cleaningDays: text(account.cleaningDays || account.frequency),
    scope: text(account.scopeOfWork || account.scope || account.serviceType),
    keysAlarm: keysAlarmYesNo(account),
    proposedMonthlyPay: payPerAccount || parseMoney(account.monthlySubcontractorPay || account.subcontractorPay),
  }));
}

/** "TRANSFER-20261011143000": the script's generateId, on the office's clock. */
function newProposalId(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `TRANSFER-${get("year")}${get("month")}${get("day")}${get("hour")}${get("minute")}${get("second")}`;
}

/* ---------- create ---------- */

export async function createSubTransferProposal(body: Body): Promise<Record<string, unknown>> {
  const proposalId = text(body.proposalId) || newProposalId();
  const createdAt = new Date().toISOString();
  const newSubcontractor = text(body.newSubcontractor || body.subcontractorName);
  const newSubcontractorEmail = text(body.newSubcontractorEmail || body.subcontractorEmail || body.email);
  const notes = text(body.notes);
  const accounts = await accountsFromBody(body);
  if (!newSubcontractor) throw new Error("Missing new subcontractor name.");
  if (accounts.length === 0) throw new Error("No accounts selected.");

  const sql = getSql();
  const stamp = Date.now().toString(36);
  await sql.transaction(
    accounts.map(
      (account, index) => sql`
        INSERT INTO sub_transfer_proposals (legacy_key, proposal_id, created_at_raw, status, new_subcontractor, new_subcontractor_email, new_subcontractor_id,
          account_name, account_pk, address, cleaning_days, scope, keys_alarm, proposed_monthly_pay, proposed_monthly_pay_raw, notes)
        VALUES (${`pg-${proposalId}-${stamp}-${index + 1}`}, ${proposalId}, ${createdAt}, 'Draft', ${newSubcontractor}, ${newSubcontractorEmail},
          (SELECT CASE WHEN count(*) = 1 THEN min(id) END FROM subcontractors WHERE ${newSubcontractorEmail} <> '' AND lower(btrim(email)) = lower(${newSubcontractorEmail})),
          ${account.accountName},
          (SELECT CASE WHEN count(*) = 1 THEN min(pk) END FROM accounts WHERE (to_jsonb(accounts)->>'deleted_at') IS NULL AND ${account.accountName} <> '' AND lower(btrim(account_name)) = lower(${account.accountName})),
          ${account.address}, ${account.cleaningDays}, ${account.scope}, ${account.keysAlarm}, ${account.proposedMonthlyPay}, ${String(account.proposedMonthlyPay)}, ${notes})
      `
    )
  );

  return {
    success: true,
    proposalId,
    newSubcontractor,
    newSubcontractorEmail,
    accounts,
    accountNames: accounts.map((account) => account.accountName).join(", "),
    accountIds: accounts
      .map((account) => account.accountId)
      .filter(String)
      .join(", "),
    notes,
  };
}

/* ---------- the list ---------- */

type Row = {
  id: string | number;
  proposal_id: string;
  created_at_raw: string;
  status: string;
  new_subcontractor: string;
  new_subcontractor_email: string;
  account_name: string;
  address: string;
  cleaning_days: string;
  scope: string;
  keys_alarm: string;
  proposed_monthly_pay_raw: string;
  accepted_at_raw: string;
  declined_at_raw: string;
  notes: string;
  sent_at_raw: string;
  source_row: number | null;
};

/**
 * A date as Apps Script answered it: an ISO time. Rows refreshed by
 * scripts/migrate/refresh-sub-transfers.mts already hold that exact time. A
 * row that only has the sheet's own text ("10/6/2026 14:05:09", shown on the
 * sheet's clock, which is US Pacific) is converted. Text that is not a date
 * is passed on as it is.
 */
function sheetMoment(raw: string): string {
  const value = raw.trim();
  if (!value || /^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!m) return value;
  const [year, month, day, hour, minute, second] = [Number(m[3]), Number(m[1]), Number(m[2]), Number(m[4] ?? 0), Number(m[5] ?? 0), Number(m[6] ?? 0)];
  // The sheet's clock at that moment is 7 or 8 hours behind UTC: try both and keep the one that reads back right.
  for (const offset of [7, 8]) {
    const guess = new Date(Date.UTC(year, month - 1, day, hour + offset, minute, second));
    const back = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", hour: "numeric", hourCycle: "h23", day: "numeric" }).formatToParts(guess);
    if (Number(back.find((part) => part.type === "hour")?.value) === hour && Number(back.find((part) => part.type === "day")?.value) === day) return guess.toISOString();
  }
  return value;
}

export type ProposalGroup = {
  id: string;
  proposalId: string;
  createdAt: string;
  status: string;
  newSubcontractor: string;
  newSubcontractorEmail: string;
  totalMonthlyRevenue: string;
  proposedMonthlyPay: string;
  notes: string;
  acceptedAt: string;
  declinedAt: string;
  sentAt: string;
  accountCount: number;
  accounts: { accountName: string; address: string; cleaningDays: string; scope: string; keysAlarm: string; proposedMonthlyPay: number }[];
  rowNumber: number;
  accountsJson: string;
};

/** Every proposal, newest first, one entry per proposal with its accounts (the script's getSubTransferProposals). */
export async function getSubTransferProposals(): Promise<ProposalGroup[]> {
  const rows = (await getSql()`
    SELECT id, proposal_id, created_at_raw, status, new_subcontractor, new_subcontractor_email, account_name, address, cleaning_days, scope, keys_alarm,
           proposed_monthly_pay_raw, accepted_at_raw, declined_at_raw, notes, sent_at_raw, source_row
    FROM sub_transfer_proposals
    ORDER BY (source_row IS NULL), source_row, id
  `) as Row[];
  const grouped = new Map<string, ProposalGroup & { total: number }>();
  rows.forEach((row, index) => {
    // The sheet row number: its own for rows from the sheet, then counting on for rows saved here.
    const rowNumber = index + 2;
    const proposalId = row.proposal_id.trim() || `PROPOSAL-${rowNumber}`;
    let group = grouped.get(proposalId);
    if (!group) {
      group = {
        id: proposalId,
        proposalId,
        createdAt: sheetMoment(row.created_at_raw),
        status: row.status || "Draft",
        newSubcontractor: row.new_subcontractor,
        newSubcontractorEmail: row.new_subcontractor_email,
        totalMonthlyRevenue: "",
        proposedMonthlyPay: "0",
        notes: row.notes,
        acceptedAt: sheetMoment(row.accepted_at_raw),
        declinedAt: sheetMoment(row.declined_at_raw),
        sentAt: sheetMoment(row.sent_at_raw),
        accountCount: 0,
        accounts: [],
        rowNumber,
        accountsJson: "[]",
        total: 0,
      };
      grouped.set(proposalId, group);
    }
    if (row.account_name) {
      const pay = Number(parseMoney(row.proposed_monthly_pay_raw));
      group.accounts.push({ accountName: row.account_name, address: row.address, cleaningDays: row.cleaning_days, scope: row.scope, keysAlarm: row.keys_alarm, proposedMonthlyPay: pay });
      group.accountCount++;
      group.total += pay;
    }
  });
  return [...grouped.values()]
    .map(({ total, ...group }) => ({ ...group, proposedMonthlyPay: String(total || 0), accountsJson: JSON.stringify(group.accounts) }))
    .reverse();
}

/* ---------- the email to the subcontractor ---------- */

const money = (value: unknown) => {
  const number = Number(String(value || 0).replace(/\$/g, "").replace(/,/g, "").trim());
  return Number.isNaN(number) ? 0 : number;
};
const formatMoney = (value: unknown) => "$" + money(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Sends the proposal to the subcontractor, with an Accept and a Decline
 * button for each account, and marks the proposal Sent. `appUrl` is this
 * app's own address: the buttons open it.
 */
export async function sendSubTransferProposalEmail(proposal: Body, appUrl: string): Promise<Record<string, unknown>> {
  try {
    const subcontractorName = text(proposal.newSubcontractor || proposal.subcontractorName || proposal.subName || proposal.subcontractor || proposal.companyName) || "Subcontractor";
    let subcontractorEmail = text(proposal.newSubcontractorEmail || proposal.subcontractorEmail || proposal.subEmail || proposal.email || proposal.toEmail);
    if (!subcontractorEmail && subcontractorName) subcontractorEmail = await findSubcontractorEmailByName(subcontractorName);
    if (!subcontractorEmail) return { success: false, message: "Subcontractor email is missing.", subcontractorNameReceived: subcontractorName, proposalReceived: proposal };

    const accounts = Array.isArray(proposal.accounts) ? (proposal.accounts as Body[]) : [];
    const proposalId = text(proposal.proposalId || proposal.id) || "Proposal";
    const respondUrl = `${appUrl.replace(/\/$/, "")}/api/sub-transfer-response`;

    let totalProposedPay = money(proposal.totalProposedPay || proposal.totalMonthlyPay || proposal.totalSubPay || proposal.proposedMonthlyPay || 0);
    const payOf = (account: Body) => money(account.proposedMonthlyPay || account.proposedPay || account.subPay || account.monthlySubcontractorPay || 0);
    if (totalProposedPay === 0 && accounts.length > 0) totalProposedPay = accounts.reduce((total, account) => total + payOf(account), 0);

    const facts = (account: Body) => {
      const accountName = String(account.accountName || account.name || "Account");
      const link = (response: string) => `${respondUrl}?action=respondSubTransferProposal&proposalId=${encodeURIComponent(proposalId)}&accountName=${encodeURIComponent(accountName)}&response=${response}`;
      return {
        accountName,
        address: String(account.address || account.accountAddress || ""),
        cleaningDays: String(account.cleaningDays || account.frequency || ""),
        scope: String(account.scope || account.scopeOfWork || account.serviceType || ""),
        keysAlarm: String(account.keysAlarm || account.keysAlarmRequired || account.hasKey || "No"),
        proposedPay: payOf(account),
        acceptUrl: link("accepted"),
        declineUrl: link("declined"),
      };
    };

    const plainAccountLines = accounts
      .map((account, index) => {
        const a = facts(account);
        return (
          index + 1 + ". " + a.accountName + "\n" +
          "Address: " + (a.address || "-") + "\n" +
          "Cleaning Days: " + (a.cleaningDays || "-") + "\n" +
          "Scope: " + (a.scope || "-") + "\n" +
          "Keys / Alarm Required: " + (a.keysAlarm || "No") + "\n" +
          "Proposed Monthly Pay: " + formatMoney(a.proposedPay) + "\n" +
          "Accept this account: " + a.acceptUrl + "\n" +
          "Decline this account: " + a.declineUrl + "\n"
        );
      })
      .join("\n");

    const htmlAccountCards = accounts
      .map((account, index) => {
        const a = facts(account);
        return (
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:16px;margin-bottom:16px;">' +
          "<tr>" +
          '<td style="padding:22px;vertical-align:top;">' +
          '<div style="font-size:12px;color:#94a3b8;font-weight:700;margin-bottom:6px;">ACCOUNT ' + (index + 1) + "</div>" +
          '<div style="font-size:19px;font-weight:900;color:#0f172a;margin-bottom:4px;">' + escapeHtml(a.accountName) + "</div>" +
          '<div style="font-size:13px;color:#64748b;margin-bottom:16px;">' + escapeHtml(a.address || "-") + "</div>" +
          '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:#334155;">' +
          '<tr><td style="padding:4px 0;color:#94a3b8;width:90px;">Days</td><td style="padding:4px 0;">' + escapeHtml(a.cleaningDays || "-") + "</td></tr>" +
          '<tr><td style="padding:4px 0;color:#94a3b8;vertical-align:top;">Scope</td><td style="padding:4px 0;">' + escapeHtml(a.scope || "-") + "</td></tr>" +
          '<tr><td style="padding:4px 0;color:#94a3b8;">Keys/Alarm</td><td style="padding:4px 0;color:#b45309;font-weight:700;">' + escapeHtml(a.keysAlarm || "No") + "</td></tr>" +
          "</table>" +
          "</td>" +
          '<td style="padding:22px;vertical-align:top;text-align:right;white-space:nowrap;width:160px;">' +
          '<div style="font-size:20px;font-weight:900;color:#003b7a;margin-bottom:16px;">' + escapeHtml(formatMoney(a.proposedPay)) + "</div>" +
          '<a href="' + a.acceptUrl + '" style="display:block;background:#15803d;color:white;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:900;font-size:13px;margin-bottom:8px;">Accept</a>' +
          '<a href="' + a.declineUrl + '" style="display:block;background:#b91c1c;color:white;text-decoration:none;padding:11px 18px;border-radius:10px;font-weight:900;font-size:13px;">Decline</a>' +
          "</td>" +
          "</tr>" +
          "</table>"
        );
      })
      .join("");

    const notesEmailUrl =
      "mailto:info@cleaningworldinc.com,crm@cleaningworldinc.com" +
      "?subject=" + encodeURIComponent("Notes for Transfer Proposal " + proposalId) +
      "&body=" + encodeURIComponent("Proposal ID: " + proposalId + "\nSubcontractor: " + subcontractorName + "\n\nNotes / Questions:");

    const subject = "Cleaning World Account Transfer Proposal - " + subcontractorName;

    const plainBody =
      "Hi " + subcontractorName + ",\n\n" +
      "Cleaning World is sending you the following account transfer proposal for review.\n\n" +
      "Proposal ID: " + proposalId + "\n\n" +
      "Accounts included:\n\n" + plainAccountLines +
      "\nTotal Proposed Subcontractor Pay: " + formatMoney(totalProposedPay) + "\n\n" +
      "Important: If keys or alarm are required, details will be provided only after the account is accepted and approved.\n\n" +
      "Thank you,\nCleaning World Operations";

    const htmlBody =
      '<div style="margin:0;padding:0;background:#eef4fb;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">' +
      '<div style="max-width:680px;margin:0 auto;padding:24px;">' +
      '<div style="background:linear-gradient(135deg,#003b7a 0%,#005bbb 55%,#00a8e8 100%);border-radius:24px;padding:28px;color:white;">' +
      '<table role="presentation" cellpadding="0" cellspacing="0"><tr>' +
      '<td style="background:white;border-radius:16px;padding:10px;width:130px;height:70px;text-align:center;vertical-align:middle;">' +
      '<img src="' + LOGO_URL + '" alt="Cleaning World" style="max-width:100%;max-height:100%;" />' +
      "</td>" +
      '<td style="padding-left:16px;">' +
      '<div style="font-size:27px;font-weight:900;line-height:1;">Cleaning World</div>' +
      '<div style="font-size:14px;font-weight:700;margin-top:6px;color:rgba(255,255,255,0.92);">Account Transfer Proposal</div>' +
      "</td></tr></table>" +
      "</div>" +
      '<div style="background:white;border-radius:24px;margin-top:18px;padding:28px;border:1px solid #dbeafe;">' +
      '<h2 style="margin:0 0 8px;font-size:22px;color:#003b7a;">Hi ' + escapeHtml(subcontractorName) + "</h2>" +
      '<p style="margin:0 0 24px;font-size:14px;color:#475569;line-height:1.6;">Please review each account below. You can accept or decline each account individually.</p>' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:26px;"><tr>' +
      '<td style="background:#eff6ff;border-radius:16px;padding:18px;width:50%;">' +
      '<div style="font-size:12px;color:#1d4ed8;font-weight:700;">PROPOSAL ID</div>' +
      '<div style="font-size:19px;color:#003b7a;font-weight:900;margin-top:4px;">' + escapeHtml(proposalId) + "</div>" +
      "</td>" +
      '<td style="width:12px;"></td>' +
      '<td style="background:#f0fdf4;border-radius:16px;padding:18px;width:50%;">' +
      '<div style="font-size:12px;color:#166534;font-weight:700;">TOTAL PROPOSED PAY</div>' +
      '<div style="font-size:19px;color:#166534;font-weight:900;margin-top:4px;">' + escapeHtml(formatMoney(totalProposedPay)) + "</div>" +
      "</td>" +
      "</tr></table>" +
      htmlAccountCards +
      '<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:16px;padding:16px;margin-top:8px;color:#7c2d12;font-size:13px;line-height:1.6;">' +
      "<strong>Important:</strong> If keys or alarm are required, details will be provided only after that account is accepted and approved by Cleaning World." +
      "</div>" +
      '<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:16px;margin-top:16px;font-size:13px;line-height:1.6;">' +
      "<strong>Proposal Notes:</strong><br>" +
      '<div style="margin-top:6px;white-space:pre-wrap;color:#334155;">' + escapeHtml(proposal.notes || "-") + "</div>" +
      "</div>" +
      '<div style="text-align:center;margin-top:26px;">' +
      '<a href="' + notesEmailUrl + '" style="display:inline-block;background:#003b7a;color:white;text-decoration:none;padding:14px 20px;border-radius:12px;font-weight:900;">Send Notes / Questions</a>' +
      "</div>" +
      '<p style="font-size:12px;color:#64748b;line-height:1.6;margin-top:22px;">Clicking Accept or Decline records the response for that account and notifies Cleaning World. It does not automatically move the account until Cleaning World completes final approval.</p>' +
      '<p style="margin-top:20px;">Thank you,<br><strong>Cleaning World Operations</strong></p>' +
      "</div>" +
      "</div>" +
      "</div>";

    const sent = await sendHtmlEmail({ to: [subcontractorEmail], subject, text: plainBody, html: htmlBody, fromName: SENDER_NAME });
    if (!sent) return { success: false, message: "Failed to send transfer proposal email: email is not set up here." };

    if (proposalId && proposalId !== "Proposal") {
      await getSql()`UPDATE sub_transfer_proposals SET status = 'Sent', sent_at_raw = ${new Date().toISOString()}, updated_at = now() WHERE btrim(proposal_id) = ${proposalId}`;
    }
    return { success: true, proposalId, sentTo: subcontractorEmail, message: "Subcontractor transfer proposal sent successfully." };
  } catch (error) {
    return { success: false, message: "Failed to send transfer proposal email: " + error };
  }
}

/* ---------- accept / decline ---------- */

type Marked = { account_name: string; address: string; proposed_monthly_pay_raw: string; new_subcontractor: string; new_subcontractor_email: string; notes: string };

/** Marks every row of the proposal Accepted or Declined, with the time. Returns the rows, in order. */
async function markResponse(proposalId: string, accepted: boolean): Promise<Marked[]> {
  const now = new Date().toISOString();
  const sql = getSql();
  const rows = (await (accepted
    ? sql`UPDATE sub_transfer_proposals SET status = 'Accepted', accepted_at_raw = ${now}, updated_at = now() WHERE btrim(proposal_id) = ${proposalId}
          RETURNING id, source_row, account_name, address, proposed_monthly_pay_raw, new_subcontractor, new_subcontractor_email, notes`
    : sql`UPDATE sub_transfer_proposals SET status = 'Declined', declined_at_raw = ${now}, updated_at = now() WHERE btrim(proposal_id) = ${proposalId}
          RETURNING id, source_row, account_name, address, proposed_monthly_pay_raw, new_subcontractor, new_subcontractor_email, notes`)) as (Marked & { id: string | number; source_row: number | null })[];
  return rows.sort((a, b) => Number(a.source_row === null) - Number(b.source_row === null) || (a.source_row ?? 0) - (b.source_row ?? 0) || Number(a.id) - Number(b.id));
}

/** The office changes a proposal's status from the app (the script's updateSubTransferProposalStatus). No email. */
export async function updateSubTransferProposalStatus(body: Body): Promise<Record<string, unknown>> {
  const proposalId = text(body.proposalId);
  const accepted = text(body.status).toLowerCase() === "accepted";
  await markResponse(proposalId, accepted);
  const finalStatus = accepted ? "Accepted" : "Declined";
  return { success: true, message: "Response recorded: " + finalStatus, proposalId, status: finalStatus };
}

/**
 * A subcontractor tapped Accept or Decline in the email. Records it, tells
 * the office by email, and answers with the same thank-you page the script
 * showed. Always answers with a page, never an error code.
 */
export async function respondSubTransferProposal(params: { proposalId?: string; id?: string; response?: string; status?: string }): Promise<string> {
  try {
    const proposalId = text(params.proposalId || params.id);
    const response = text(params.response || params.status).toLowerCase();
    if (!proposalId) return ("<h2>Missing Proposal ID</h2><p>Please contact Cleaning World.</p>");
    if (response !== "accepted" && response !== "declined") return ("<h2>Invalid Response</h2><p>Please contact Cleaning World.</p>");

    const finalStatus = response === "accepted" ? "Accepted" : "Declined";
    const rows = await markResponse(proposalId, response === "accepted");
    if (rows.length === 0) return ("<h2>Proposal not found</h2><p>Please contact Cleaning World.</p>");

    const newSubcontractor = rows[0].new_subcontractor.trim();
    const newSubcontractorEmail = rows[0].new_subcontractor_email.trim();
    const notes = rows[0].notes.trim();
    const accountsText = rows
      .map((row, index) => index + 1 + ". " + (row.account_name.trim() || "-") + "\nAddress: " + (row.address.trim() || "-") + "\nProposed Monthly Pay: " + (row.proposed_monthly_pay_raw.trim() || "-"))
      .join("\n\n");

    const subject = "Transfer Proposal " + finalStatus + " - " + proposalId;
    const plainBody =
      "A subcontractor responded to a transfer proposal.\n\n" +
      "Proposal ID: " + proposalId + "\n" +
      "Response: " + finalStatus + "\n" +
      "Subcontractor: " + (newSubcontractor || "-") + "\n" +
      "Subcontractor Email: " + (newSubcontractorEmail || "-") + "\n\n" +
      "Accounts:\n" + accountsText +
      "\n\nNotes:\n" + (notes || "-");
    const htmlBody =
      '<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;padding:24px;color:#0f172a;">' +
      '<div style="max-width:720px;margin:0 auto;background:white;border-radius:18px;padding:24px;border:1px solid #dbeafe;">' +
      '<h2 style="margin-top:0;color:#003b7a;">Transfer Proposal ' + escapeHtml(finalStatus) + "</h2>" +
      "<p><strong>Proposal ID:</strong> " + escapeHtml(proposalId) + "</p>" +
      "<p><strong>Response:</strong> " + escapeHtml(finalStatus) + "</p>" +
      "<p><strong>Subcontractor:</strong> " + escapeHtml(newSubcontractor || "-") + "</p>" +
      "<p><strong>Subcontractor Email:</strong> " + escapeHtml(newSubcontractorEmail || "-") + "</p>" +
      '<pre style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:12px;padding:14px;white-space:pre-wrap;">' + escapeHtml(accountsText || "-") + "</pre>" +
      "<p><strong>Notes:</strong><br>" + escapeHtml(notes || "-") + "</p>" +
      "</div></div>";
    await sendHtmlEmail({ to: RESPONSE_NOTICE_TO, subject, text: plainBody, html: htmlBody, fromName: SENDER_NAME });

    const responseColor = response === "accepted" ? "#15803d" : "#b91c1c";
    return (
      '<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;min-height:100vh;padding:30px;color:#0f172a;">' +
        '<div style="max-width:680px;margin:0 auto;background:white;border-radius:20px;padding:28px;border:1px solid #dbeafe;text-align:center;">' +
        '<h1 style="color:' + responseColor + ';margin-top:0;">Thank you</h1>' +
        "<p>Your response has been recorded as:</p>" +
        '<div style="display:inline-block;background:' + responseColor + ';color:white;font-weight:900;padding:12px 18px;border-radius:12px;margin:10px 0;">' + escapeHtml(finalStatus) + "</div>" +
        "<p><strong>Proposal ID:</strong> " + escapeHtml(proposalId) + "</p>" +
        "<p>Cleaning World has been notified. Final account transfer will be completed by Cleaning World after review.</p>" +
        '<p style="margin-top:24px;"><a href="mailto:info@cleaningworldinc.com,crm@cleaningworldinc.com?subject=' + encodeURIComponent("Notes for Transfer Proposal " + proposalId) + '" style="color:#003b7a;font-weight:900;">Send Notes / Questions</a></p>' +
        "</div></div>"
    );
  } catch (error) {
    console.error("[sub-transfers respond]", error instanceof Error ? error.message : error);
    // The script printed the error text here; a database message is not for a subcontractor to read.
    return ("<h2>Something went wrong</h2><p>Please contact Cleaning World.</p>");
  }
}
