// POST /api/subcontractor-portal/complaint-photo (form fields "file" and
// "complaint"): the sub's "after" photo for "Mark Resolved by Sub"
// (lib/complaintFixPhotos.ts). Only for a complaint on the sub's own accounts.
// Identity comes from the sub_session cookie, never from the page.

import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { getSubPortalByEmail } from "@/lib/data/sub-portal";
import { saveFixPhoto } from "@/lib/complaintFixPhotos";

export async function POST(request: NextRequest) {
  const session = await getIronSession<SubSessionData>(request, filesJson({}), subSessionOptions());
  const email = session.subcontractorEmail?.trim() ?? "";
  if (!email) return filesJson({ success: false, error: "Not logged in." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  const wanted = String(form?.get("complaint") ?? "").trim();
  const portal = await getSubPortalByEmail(email).catch(() => null);
  const mine = (portal?.complaints ?? []).find((c) => wanted !== "" && (String(c.id).trim() === wanted || String(c.rowNumber) === wanted));
  if (!mine) return filesJson({ success: false, error: "This complaint is not on one of your accounts." }, { status: 403 });

  try {
    const url = await saveFixPhoto(String(mine.id ?? "").trim() || String(mine.rowNumber), form?.get("file"));
    // filesJson signs a private address so the sub's screen can show it.
    return filesJson({ success: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    console.error("[sub portal complaint photo]", message);
    return filesJson({ success: false, error: message }, { status: 400 });
  }
}
