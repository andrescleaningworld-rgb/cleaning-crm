// Public, no-login route — submits a site issue (with up to 5 photos) for
// one site link. Response is success/issueId only; never echoes back
// account/sub data.
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import {
  getActiveSiteLinkByToken,
  createSiteIssue,
  addSiteIssuePhoto,
} from "@/lib/siteLinkDb";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { notifyNewSiteIssue } from "@/lib/siteLinkNotify";
import { logActivity } from "@/lib/activityLog";

const MAX_NOTE_LENGTH = 1000;
const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
]);
const ALLOWED_CATEGORIES = new Set([
  "restroom",
  "trash",
  "damage",
  "leak",
  "access",
  "supplies",
  "other",
]);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const link = await getActiveSiteLinkByToken(token);
    if (!link) {
      return NextResponse.json({ success: false, error: "Link not active." }, { status: 404 });
    }

    const allowed = await checkRateLimit(`issue:${token}`);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests — please wait a moment and try again." },
        { status: 429 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { success: false, error: "Photo storage is not configured." },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const category = String(formData.get("category") ?? "").trim().toLowerCase();
    const note = String(formData.get("note") ?? "").trim().slice(0, MAX_NOTE_LENGTH);

    if (!ALLOWED_CATEGORIES.has(category)) {
      return NextResponse.json(
        { success: false, error: "Invalid category." },
        { status: 400 }
      );
    }

    const files = formData.getAll("photos").filter((f): f is File => f instanceof File);
    if (files.length > MAX_PHOTOS) {
      return NextResponse.json(
        { success: false, error: `Up to ${MAX_PHOTOS} photos allowed.` },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (!ALLOWED_PHOTO_TYPES.has(file.type)) {
        return NextResponse.json(
          { success: false, error: `Unsupported photo format: ${file.type || "unknown"}.` },
          { status: 400 }
        );
      }
      if (file.size > MAX_PHOTO_BYTES) {
        return NextResponse.json(
          { success: false, error: "Each photo must be 8MB or smaller." },
          { status: 400 }
        );
      }
    }

    const issueId = await createSiteIssue({ linkId: link.id, category, note });

    const photoUrls: string[] = [];
    for (const file of files) {
      const extension = file.type === "image/png" ? "png" : file.type === "image/heic" || file.type === "image/heif" ? "heic" : "jpg";
      const filename = `site-issues/${issueId}/${crypto.randomUUID()}.${extension}`;
      try {
        const blob = await put(filename, file, {
          access: "public",
          contentType: file.type,
          addRandomSuffix: false,
        });
        await addSiteIssuePhoto(issueId, blob.url);
        photoUrls.push(blob.url);
      } catch (uploadError) {
        // One photo failing to upload shouldn't lose the whole issue
        // report — the issue and any other successfully-uploaded photos
        // are already saved.
        console.error("[site-link issue POST] photo upload failed:", uploadError);
      }
    }

    const origin = new URL(request.url).origin;
    await notifyNewSiteIssue({
      origin,
      accountId: link.accountId,
      linkLabel: link.label,
      issueId,
      category,
      note,
      photoUrls,
    });

    await logActivity({
      actorAccountId: null,
      actorRole: "site-link",
      actorName: link.label,
      action: "create",
      entityType: "site_issue",
      entityId: String(issueId),
    });

    return NextResponse.json({ success: true, issueId, photosUploaded: photoUrls.length });
  } catch (error) {
    console.error("[site-link issue POST]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong submitting this report." },
      { status: 500 }
    );
  }
}
