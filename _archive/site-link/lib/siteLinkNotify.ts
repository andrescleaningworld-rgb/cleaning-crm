// Email notifications for the Site Supply Link feature. Reuses
// sendInternalNotification (lib/email.ts) — the same info@/crm@ addresses
// every other "notify the internal team" flow in this codebase already
// sends to, which reach Andres. There is no manager EMAIL anywhere in this
// codebase's data model (Manager/Staff rows only carry name + phone — see
// AccountSummary in lib/googleSheets.ts and the Manager/Staff types there),
// so "the account's manager if available" can't resolve to a real send
// target today; the manager's NAME is included prominently in the email
// body instead so whoever reads info@/crm@ can loop them in manually. If a
// manager email is ever added to the Staff/Managers sheet, wire it in here
// as an additional recipient.
import { sendInternalNotification } from "@/lib/email";
import { getAccountSummaryById } from "@/lib/googleSheets";

function adminQueueLink(origin: string): string {
  return `${origin}/site-links/queue`;
}

export async function notifyNewSupplyOrder(input: {
  origin: string;
  accountId: string;
  linkLabel: string;
  orderId: number;
  note: string;
  lines: { itemName: string; unit: string; qty: number }[];
}): Promise<void> {
  const account = await getAccountSummaryById(input.accountId).catch(() => null);

  const lines = [
    `Site: ${input.linkLabel}`,
    `Account: ${account?.accountName || "(unknown — account_id " + input.accountId + ")"}`,
    account?.address ? `Address: ${account.address}` : "",
    account?.managerName ? `Manager: ${account.managerName}` : "",
    "",
    "Items requested:",
    ...input.lines.map((l) => `  - ${l.itemName} x${l.qty} (${l.unit})`),
    input.note ? "" : "",
    input.note ? `Note: ${input.note}` : "",
    "",
    `Admin queue: ${adminQueueLink(input.origin)}`,
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));

  await sendInternalNotification(
    `[Site Supply Link] New supply order — ${account?.accountName || input.linkLabel}`,
    lines
  ).catch((error) => {
    console.error("[siteLinkNotify] notifyNewSupplyOrder failed:", error);
  });
}

export async function notifyNewSiteIssue(input: {
  origin: string;
  accountId: string;
  linkLabel: string;
  issueId: number;
  category: string;
  note: string;
  photoUrls: string[];
}): Promise<void> {
  const account = await getAccountSummaryById(input.accountId).catch(() => null);

  const lines = [
    `Site: ${input.linkLabel}`,
    `Account: ${account?.accountName || "(unknown — account_id " + input.accountId + ")"}`,
    account?.address ? `Address: ${account.address}` : "",
    account?.managerName ? `Manager: ${account.managerName}` : "",
    "",
    `Category: ${input.category}`,
    input.note ? `Note: ${input.note}` : "",
    "",
    ...(input.photoUrls.length > 0
      ? ["Photos:", ...input.photoUrls.map((url) => `  - ${url}`)]
      : []),
    "",
    `Admin queue: ${adminQueueLink(input.origin)}`,
  ].filter((line, i, arr) => !(line === "" && arr[i - 1] === ""));

  await sendInternalNotification(
    `[Site Supply Link] New issue reported — ${account?.accountName || input.linkLabel}`,
    lines
  ).catch((error) => {
    console.error("[siteLinkNotify] notifyNewSiteIssue failed:", error);
  });
}
