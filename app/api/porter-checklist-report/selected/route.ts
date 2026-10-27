// Admin-gated like ../route.ts (default proxy.ts admin-cookie check).
// "Share selected" on the Submitted page: one PDF with only the checked
// checklists and Crew Link supply requests, grouped by account, newest first.
// POST { checklistIds: number[], supplyIds: number[] }
// Only supply requests picked: the Supply Order PDF instead (lib/pdf/supply-order.tsx).
import { NextRequest, NextResponse } from "next/server";
import { fetchAllMainAccounts } from "@/lib/data/accounts";
import { getSubmissionDetailsByIds } from "@/lib/checklistDb";
import { getCrewLinkSupplyOrdersByIds } from "@/lib/teamHubDb";
import { renderSelectedSubmissionsReportPdf, type SelectedReportGroup, type SelectedReportItem } from "@/lib/pdf/porter-checklist-report";
import { renderSupplyOrderPdf } from "@/lib/pdf/supply-order";
import { loadSupplyOrderDocs, supplyOrderFileName } from "@/lib/pg/supply-order-docs";

export const maxDuration = 45;

const MAX_ITEMS = 200;

function cleanIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
}

function slugifyUnderscore(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, "_").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as { checklistIds?: unknown; supplyIds?: unknown };
    const checklistIds = cleanIds(body.checklistIds);
    const supplyIds = cleanIds(body.supplyIds);
    if (checklistIds.length + supplyIds.length === 0) {
      return NextResponse.json({ success: false, error: "Nothing selected." }, { status: 400 });
    }
    if (checklistIds.length + supplyIds.length > MAX_ITEMS) {
      return NextResponse.json({ success: false, error: `Select at most ${MAX_ITEMS} at a time.` }, { status: 400 });
    }

    // Only supply requests picked: the Supply Order PDF (one order per page), not a cleaning report.
    if (checklistIds.length === 0) {
      const docs = await loadSupplyOrderDocs(supplyIds.map((id) => `crew-${id}`));
      if (docs.length === 0) return NextResponse.json({ success: false, error: "Those supply requests were not found." }, { status: 404 });
      const pdf = await renderSupplyOrderPdf(docs);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${supplyOrderFileName(docs)}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const [checklists, orders, accounts] = await Promise.all([
      getSubmissionDetailsByIds(checklistIds),
      getCrewLinkSupplyOrdersByIds(supplyIds),
      fetchAllMainAccounts(),
    ]);
    const accountBy = new Map(accounts.map((a) => [a.accountId, a]));

    const byAccount = new Map<string, { name: string; items: SelectedReportItem[] }>();
    const add = (accountId: string, fallbackName: string, item: SelectedReportItem) => {
      if (!byAccount.has(accountId)) {
        byAccount.set(accountId, { name: accountBy.get(accountId)?.accountName || fallbackName || accountId, items: [] });
      }
      byAccount.get(accountId)!.items.push(item);
    };
    for (const s of checklists) {
      add(s.accountId, s.accountName, {
        kind: "checklist",
        at: s.submittedAt,
        checklist: {
          id: s.id,
          submittedAt: s.submittedAt,
          porterName: s.porterName,
          tabName: s.tabName,
          timeIn: s.timeIn,
          timeOut: s.timeOut,
          startedAt: s.startedAt,
          completedCount: s.completedCount,
          totalCount: s.totalCount,
          generalNotes: s.generalNotes,
          sections: s.sections,
        },
      });
    }
    for (const o of orders) {
      add(o.crewLinkAccountId ?? "", "", {
        kind: "supplies",
        at: o.createdAt,
        supplies: {
          id: o.id,
          createdAt: o.createdAt,
          reporterName: o.reporterName || o.workerFirstName || "",
          status: o.status,
          note: o.noteEnglish || o.note,
          otherItems: o.otherItems,
          lines: o.lines.map((l) => ({ itemName: l.itemName, unit: l.unit, qty: l.qty })),
        },
      });
    }

    if (byAccount.size === 0) {
      return NextResponse.json({ success: false, error: "Those submissions were not found." }, { status: 404 });
    }

    const time = (iso: string) => new Date(iso).getTime() || 0;
    const groups: SelectedReportGroup[] = [...byAccount.entries()]
      .map(([accountId, g]) => ({
        accountName: g.name,
        address: accountBy.get(accountId)?.address || "",
        items: g.items.sort((a, b) => time(b.at) - time(a.at)),
      }))
      // The account with the newest submission comes first.
      .sort((a, b) => time(b.items[0].at) - time(a.items[0].at));

    const title = groups.length === 1 ? groups[0].accountName : `${groups.length} accounts`;
    const generatedDate = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    const pdfBuffer = await renderSelectedSubmissionsReportPdf({ title, generatedDate, groups });
    const filename = `${slugifyUnderscore(title)}_Cleaning_Report_${slugifyUnderscore(generatedDate)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to generate the report." },
      { status: 500 }
    );
  }
}
