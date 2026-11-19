// CW Now Photo Checklist (lib/photoChecklist.ts) for the office. Staff only:
// the proxy.ts admin gate, and a staff login is checked here too.
//
// GET  ?accountId=…            { ready, crewScreen, reports }  the account's Work reports list
// GET  ?id=<submission>&pdf=1  the Work Report PDF (Timemark-style; lib/pdf/photo-checklist-report.tsx)
// POST { action: "setCrewScreen", accountId, screen: "classic" | "photo" }

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSubmissionDetail, getTemplateByAccountId } from "@/lib/checklistDb";
import { isCrewScreen } from "@/lib/photoChecklist";
import { getCrewScreen, listVisitPhotos, listWorkReports, photoChecklistReady, setCrewScreen, teamNameOf, visitIdOfSubmission } from "@/lib/pg/photo-checklist";
import { renderWorkReportPdf } from "@/lib/pdf/photo-checklist-report";
import { logActivity } from "@/lib/activityLog";

export const maxDuration = 60;

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, ...noStore });

const fileName = (place: string, at: string) => `Work_Report_${place.replace(/[^a-zA-Z0-9 _-]/g, "").trim().replace(/\s+/g, "_") || "Account"}_${at.slice(0, 10)}.pdf`;

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const params = request.nextUrl.searchParams;

    const id = Number(params.get("id"));
    if (params.get("pdf") === "1") {
      if (!Number.isInteger(id) || id <= 0) return refuse("id is required.", 400);
      const detail = await getSubmissionDetail(id);
      if (!detail) return refuse("That checklist was not found.", 404);
      const visitId = await visitIdOfSubmission(id);
      // The phone photo ids listed in the checklist, with their item.
      const listed = new Map<string, string>();
      for (const section of detail.sections) for (const item of section.items) for (const photo of item.photos ?? []) listed.set(photo, item.key);
      const photos = await listVisitPhotos(visitId ?? `none-${id}`, listed, detail.startedAt);
      const template = await getTemplateByAccountId(detail.accountId);
      const placeName = template?.locationName || detail.locationName || detail.accountName;
      const pdf = await renderWorkReportPdf({
        placeName,
        teamName: await teamNameOf(detail.accountId),
        preparedBy: detail.porterName,
        tabName: detail.tabName,
        startedAt: detail.startedAt,
        finishedAt: detail.submittedAt,
        sections: detail.sections,
        photos,
      });
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          // Opens in the browser (print from there); the name is used when saved.
          "Content-Disposition": `inline; filename="${fileName(placeName, detail.submittedAt)}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const accountId = params.get("accountId")?.trim() ?? "";
    if (!accountId) return refuse("accountId is required.", 400);
    const ready = await photoChecklistReady();
    const [crewScreen, reports] = await Promise.all([getCrewScreen(accountId), listWorkReports(accountId)]);
    return NextResponse.json({ success: true, ready, crewScreen, reports }, noStore);
  } catch (error) {
    console.error("[crew-link/work-reports GET]", error instanceof Error ? error.message : error);
    return refuse("The work reports did not load. Try again.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const body = (await request.json().catch(() => ({}))) as { action?: unknown; accountId?: unknown; screen?: unknown };
    const accountId = String(body.accountId ?? "").trim();
    if (body.action !== "setCrewScreen" || !accountId) return refuse("action and accountId are required.", 400);
    if (!isCrewScreen(body.screen)) return refuse("Pick Classic or Photo Checklist.", 400);
    await setCrewScreen(accountId, body.screen);
    await logActivity({
      actorAccountId: identity.accountId ?? null,
      actorRole: identity.role ?? "manager",
      actorName: identity.name ?? "Staff",
      action: "update",
      entityType: "account",
      entityId: accountId,
      detail: `CW Now crew screen set to ${body.screen === "photo" ? "Photo Checklist" : "Classic"}`,
      source: "admin",
      accountId,
    }).catch(() => undefined);
    return NextResponse.json({ success: true, crewScreen: body.screen }, noStore);
  } catch (error) {
    return refuse(error instanceof Error ? error.message : "That did not save.", 400);
  }
}
