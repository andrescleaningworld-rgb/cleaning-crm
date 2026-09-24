// Public, no-login route (proxy.ts PUBLIC_PATHS already covers
// "/api/porter-checklist") — Crew Link "Report a problem"
// (docs/crew-link-spec.md). Gated by the link's porter_code and its
// problem-reports switch; rate-limited per code. Same multipart shape as the
// Team Hub issues route (category, note, photos[] — plus reporterName) so
// app/team-hub/[token]/IssueReportView.tsx is reused as-is.
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import { createCrewLinkIssue, addTeamHubPhoto, TEAM_HUB_ISSUE_CATEGORIES, type TeamHubIssueCategory } from "@/lib/teamHubDb";
import { resolveCrewLink, cleanReporterName } from "@/lib/crewLink";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { notifyNewProblem } from "@/lib/crewNotifications";

const MAX_NOTE_LENGTH = 2000;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-issues-post:${code}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const link = await resolveCrewLink(code);
    if (!link || !link.modules.problemReports) {
      return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });
    }

    const formData = await request.formData();
    const reporterName = cleanReporterName(formData.get("reporterName"));
    if (!reporterName) return NextResponse.json({ success: false, error: "Please enter your name." }, { status: 400 });
    const category = String(formData.get("category") ?? "").trim().toLowerCase();
    if (!TEAM_HUB_ISSUE_CATEGORIES.includes(category as TeamHubIssueCategory)) {
      return NextResponse.json({ success: false, error: "Invalid category." }, { status: 400 });
    }
    const note = String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE_LENGTH);
    if (category === "other" && !note) {
      return NextResponse.json({ success: false, error: "Please write what the problem is." }, { status: 400 });
    }

    const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length > MAX_PHOTOS) {
      return NextResponse.json({ success: false, error: `Up to ${MAX_PHOTOS} photos allowed.` }, { status: 400 });
    }
    for (const file of files) {
      if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
        return NextResponse.json({ success: false, error: `Unsupported photo format: ${file.type || "unknown"}.` }, { status: 400 });
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json({ success: false, error: "Each photo must be 8MB or smaller." }, { status: 400 });
      }
    }
    if (files.length > 0 && !process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json({ success: false, error: "Photo storage is not configured." }, { status: 500 });
    }

    const issue = await createCrewLinkIssue({
      accountId: link.template.accountId,
      reporterName,
      category: category as TeamHubIssueCategory,
      note,
    });

    const photoUrls: string[] = [];
    for (const file of files) {
      const extension = file.type === "image/png" ? "png" : file.type === "image/heic" || file.type === "image/heif" ? "heic" : "jpg";
      try {
        const blob = await put(`crew-link-issues/${issue.id}/${crypto.randomUUID()}.${extension}`, file, {
          access: "public",
          contentType: file.type,
          addRandomSuffix: false,
        });
        await addTeamHubPhoto({ parentType: "issue", parentId: issue.id, blobUrl: blob.url, workerId: null });
        photoUrls.push(blob.url);
      } catch (uploadError) {
        // Same as Team Hub: one failed upload shouldn't lose the report.
        console.error("[crew-link issues POST] photo upload failed:", uploadError);
      }
    }

    waitUntil(
      notifyNewProblem({
        source: { kind: "crew-link", reporterName },
        issueId: issue.id,
        createdAt: issue.createdAt,
        accountId: link.template.accountId,
        category,
        note,
        photoUrls,
        origin: new URL(request.url).origin,
      }).catch((error) => console.error("[crew-link issues email]", error))
    );

    return NextResponse.json({ success: true, issueId: issue.id, photosUploaded: photoUrls.length });
  } catch (error) {
    console.error("[crew-link issues POST]", error);
    return NextResponse.json({ success: false, error: "Something went wrong submitting this report." }, { status: 500 });
  }
}
