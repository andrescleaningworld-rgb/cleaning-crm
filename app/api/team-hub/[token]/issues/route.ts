// Public route (proxy.ts PUBLIC_PATHS covers "/api/team-hub") — self-checks
// via requireTeamHubWorkerSession, same pattern as the checklist/rounds
// routes. Phase 4: full "Report a problem" — category, note, up to 5
// photos to Vercel Blob. Response never carries account_id/accountName
// (see the file comment on _archive/site-link's issue route, this one's
// direct model) — only success + the issue id/photo count.
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  reportTeamHubIssue,
  addTeamHubPhoto,
  setTeamHubIssueNoteTranslation,
  TEAM_HUB_ISSUE_CATEGORIES,
  type TeamHubIssueCategory,
} from "@/lib/teamHubDb";
import { requireTeamHubWorkerSession } from "@/lib/teamHubWorkerSession";
import { lookupAccountSummary } from "@/lib/teamHubAccountLookup";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { sendInternalNotification } from "@/lib/email";
import { translateToEnglish } from "@/lib/translate";
import { waitUntil } from "@vercel/functions";

const MAX_NOTE_LENGTH = 2000;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif"]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-issues-post:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const formData = await request.formData();
    const category = String(formData.get("category") ?? "").trim().toLowerCase();
    const note = String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE_LENGTH);

    if (!TEAM_HUB_ISSUE_CATEGORIES.includes(category as TeamHubIssueCategory)) {
      return NextResponse.json({ success: false, error: "Invalid category." }, { status: 400 });
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

    const issue = await reportTeamHubIssue({
      siteId: ctx.site.id,
      crewId: ctx.crew.id,
      workerId: ctx.worker.id,
      category: category as TeamHubIssueCategory,
      note,
    });

    const photoUrls: string[] = [];
    for (const file of files) {
      const extension = file.type === "image/png" ? "png" : file.type === "image/heic" || file.type === "image/heif" ? "heic" : "jpg";
      const filename = `team-hub-issues/${issue.id}/${crypto.randomUUID()}.${extension}`;
      try {
        const blob = await put(filename, file, { access: "public", contentType: file.type, addRandomSuffix: false });
        await addTeamHubPhoto({ parentType: "issue", parentId: issue.id, blobUrl: blob.url, workerId: ctx.worker.id });
        photoUrls.push(blob.url);
      } catch (uploadError) {
        // One photo failing to upload shouldn't lose the whole report — the
        // issue and any other successfully-uploaded photos are already saved.
        console.error("[team-hub issues POST] photo upload failed:", uploadError);
      }
    }

    const origin = new URL(request.url).origin;

    // SHARED TRANSLATION (docs/team-hub-spec.md §12): translated first, then
    // the email — never in parallel with it — so the email always carries
    // the English text, not a race against whichever finishes first. Kept
    // inside one waitUntil so neither step delays the "Send" response.
    waitUntil(
      (async () => {
        let englishNote = note;
        if (note) {
          const translated = await translateToEnglish(note);
          if (translated) {
            await setTeamHubIssueNoteTranslation(issue.id, translated.english, translated.detectedLanguage);
            englishNote = translated.english;
          }
        }

        const account = await lookupAccountSummary(ctx.site.accountId);
        const noteLine = note ? `Note: ${englishNote}` : "No note.";
        const originalLine = note && englishNote !== note ? `Original: ${note}` : null;

        await sendInternalNotification(`Team Hub: new problem reported — ${ctx.site.label}`, [
          `Account: ${account?.accountName ?? ctx.site.accountId}`,
          `Crew: ${ctx.crew.name}`,
          `Category: ${category}`,
          noteLine,
          ...(originalLine ? [originalLine] : []),
          photoUrls.length > 0 ? `Photos: ${photoUrls.join(", ")}` : "No photos.",
          `Team Hub tab: ${origin}/accounts/${encodeURIComponent(ctx.site.accountId)}?tab=team-hub`,
        ]);
      })().catch((error) => console.error("[team-hub issues email]", error))
    );

    return NextResponse.json({ success: true, issueId: issue.id, photosUploaded: photoUrls.length });
  } catch (error) {
    console.error("[team-hub issues POST]", error);
    return NextResponse.json({ success: false, error: "Something went wrong submitting this report." }, { status: 500 });
  }
}
