// Admin-gated exactly like app/api/checklist-submissions/route.ts (default
// proxy.ts admin-cookie check) — this exposes the same sensitive submission
// data, just packaged as a PDF instead of JSON, so it gets the same gate.
import { NextRequest, NextResponse } from "next/server";
import { getMainAccountById } from "@/lib/googleSheets";
import { listSubmissionsForReport } from "@/lib/checklistDb";
import { renderPorterChecklistReportPdf } from "@/lib/pdf/porter-checklist-report";

export const maxDuration = 45;

function slugifyUnderscore(value: string): string {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .replace(/\s+/g, "_")
    .trim();
}

// start/end are plain "YYYY-MM-DD" calendar dates with no time component —
// parsing them with `new Date(iso)` reads them as UTC midnight, which then
// displays as the previous day in any timezone behind UTC. Build the Date
// from local year/month/day parts instead so the label matches what was typed.
function formatDateLabel(dateOnly: string): string {
  const match = dateOnly.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateOnly;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return dateOnly;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const accountId = url.searchParams.get("accountId")?.trim() || "";
  const start = url.searchParams.get("start")?.trim() || "";
  const end = url.searchParams.get("end")?.trim() || "";

  if (!accountId || !start || !end) {
    return NextResponse.json(
      { success: false, error: "accountId, start, and end are required." },
      { status: 400 }
    );
  }

  try {
    const [account, submissions] = await Promise.all([
      getMainAccountById(accountId),
      listSubmissionsForReport(accountId, start, end),
    ]);

    if (submissions.length === 0) {
      return NextResponse.json(
        { success: false, error: "No submissions found for this account in the selected date range." },
        { status: 404 }
      );
    }

    const accountName = account?.accountName || submissions[0].accountName;
    const periodLabel = `${formatDateLabel(start)} - ${formatDateLabel(end)}`;
    const generatedDate = new Date().toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const pdfBuffer = await renderPorterChecklistReportPdf({
      accountName,
      address: account?.address || "",
      periodLabel,
      generatedDate,
      truncated: submissions.length >= 200,
      submissions: submissions.map((s) => ({
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
      })),
    });

    const filename = `${slugifyUnderscore(accountName)}_Cleaning_Report_${slugifyUnderscore(periodLabel)}.pdf`;

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
