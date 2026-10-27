// A supply order as a document: what the Supply Order PDF
// (lib/pdf/supply-order.tsx) and the print page (app/supply-orders/print)
// show. Server only. Read only: the same rows the Supply Orders page reads.
//
//   key "crew-<id>"        a Crew Link order (supply_orders)
//   key "group:..." / "fallback:..."   a sub-portal order (its lines grouped
//                          like the cards, lib/supplyOrderGroup.ts)

import { fetchAllMainAccounts } from "@/lib/data/accounts";
import { getSupplyOrdersShape } from "@/lib/data/supplies";
import { formatCrewDateTime } from "@/lib/crewDateTime";
import { officeDay } from "@/lib/accountFlow";
import { orderGroupKey } from "@/lib/supplyOrderGroup";
import { differentDeliveries, shelvesReady } from "@/lib/pg/shelves";
import { getCrewLinkSupplyOrdersByIds } from "@/lib/teamHubDb";

export type SupplyOrderDocLine = { qty: string; unit: string; item: string };

export type SupplyOrderDoc = {
  key: string;
  accountName: string;
  /** The delivery address on file for the account. "" = none. */
  address: string;
  /** "Oct 27, 2026, 9:14 AM", as staff read it. */
  date: string;
  /** YYYY-MM-DD (office time), for the file name. "" when unknown. */
  day: string;
  requestedBy: string;
  lines: SupplyOrderDocLine[];
  /** Crew Link: "Other supplies not on the list", as the crew typed it. */
  other: string;
  note: string;
  /** What arrived short or extra (the print page shows it to the office). */
  different: string[];
};

const clean = (value: unknown) => String(value ?? "").trim();

function dayOf(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : officeDay(date);
}

/** The orders for these keys, in the same order; keys not found are left out. */
export async function loadSupplyOrderDocs(keys: string[]): Promise<SupplyOrderDoc[]> {
  const wanted = [...new Set(keys.map(clean).filter(Boolean))];
  if (wanted.length === 0) return [];
  const crewIds = wanted.filter((key) => /^crew-\d+$/.test(key)).map((key) => Number(key.slice(5)));
  const needSubs = wanted.some((key) => !key.startsWith("crew-"));

  const [crewOrders, subRows, accounts, different] = await Promise.all([
    getCrewLinkSupplyOrdersByIds(crewIds),
    needSubs ? getSupplyOrdersShape() : Promise.resolve([]),
    fetchAllMainAccounts(),
    shelvesReady()
      .then((ready) => (ready ? differentDeliveries(100) : []))
      .catch(() => []),
  ]);
  const accountById = new Map(accounts.map((account) => [clean(account.accountId), account]));
  const accountByName = new Map(accounts.map((account) => [clean(account.accountName).toLowerCase(), account]));
  const accountOf = (accountId: string, accountName: string) => accountById.get(clean(accountId)) ?? accountByName.get(clean(accountName).toLowerCase());
  const differentFor = (source: string, refs: string[]) => different.filter((entry) => entry.source === source && refs.includes(entry.ref)).flatMap((entry) => entry.lines);

  const docs: SupplyOrderDoc[] = [];
  for (const key of wanted) {
    if (key.startsWith("crew-")) {
      const order = crewOrders.find((entry) => `crew-${entry.id}` === key);
      if (!order) continue;
      const account = accountOf(clean(order.crewLinkAccountId), "");
      docs.push({
        key,
        accountName: clean(account?.accountName) || clean(order.crewLinkAccountId),
        address: clean(account?.address),
        date: formatCrewDateTime(order.createdAt),
        day: dayOf(order.createdAt),
        requestedBy: clean(order.reporterName) || clean(order.workerFirstName),
        lines: order.lines.map((line) => ({ qty: String(line.qty), unit: clean(line.unit), item: clean(line.itemName) })),
        other: clean(order.otherItems),
        note: clean(order.noteEnglish) || clean(order.note),
        different: differentFor("crew-order", [String(order.id)]),
      });
      continue;
    }
    const rows = subRows.filter((row) => orderGroupKey(row) === key);
    if (rows.length === 0) continue;
    const first = rows[0];
    const account = accountOf(first.accountId, first.accountName);
    const refs = rows.map((row) => clean(row.orderGroupId) || clean(row.orderId)).filter(Boolean);
    docs.push({
      key,
      accountName: clean(first.accountName) || clean(account?.accountName),
      address: clean(account?.address),
      date: clean(first.timestamp) ? formatCrewDateTime(first.timestamp) || clean(first.timestamp) : "",
      day: dayOf(first.timestamp),
      requestedBy: clean(first.subcontractor),
      lines: rows.map((row) => ({ qty: clean(row.quantity), unit: clean(row.unit), item: clean(row.supplyItem) })),
      other: "",
      note: [...new Set(rows.map((row) => clean(row.notes)).filter(Boolean))].join(" · "),
      different: differentFor("sub-order", refs),
    });
  }
  return docs;
}

/** Supply_Order_<Account>_<Date>.pdf (several orders: Supply_Orders_<Date>.pdf). */
export function supplyOrderFileName(docs: SupplyOrderDoc[]): string {
  const safe = (text: string) => text.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_") || "Order";
  const today = officeDay(new Date());
  if (docs.length === 1) return `Supply_Order_${safe(docs[0].accountName)}_${docs[0].day || today}.pdf`;
  return `Supply_Orders_${today}.pdf`;
}
