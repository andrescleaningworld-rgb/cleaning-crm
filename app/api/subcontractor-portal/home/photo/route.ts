// One photo from the sub portal home. The phone shrinks it first; this stores
// it in Blob storage (sub-photos/) and, for a before / after site photo,
// writes down whose it is and which site. With attach=1 it only returns the
// link, to go with a problem or an extra job. The sub comes from the session.

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { subPortalOnPostgres } from "@/lib/data/sub-portal";
import { readSubSession } from "@/lib/subDevice";
import { addSitePhoto, subHomeReady } from "@/lib/pg/sub-home";

const MAX_BYTES = 8 * 1024 * 1024;
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
  try {
    if (!subPortalOnPostgres() || !(await subHomeReady())) return refuse("Not available here yet.", 409);
    const session = await readSubSession(request, NextResponse.json({}));
    if (!session.subcontractorEmail) return refuse("Not logged in.", 401);
    if (!process.env.BLOB_READ_WRITE_TOKEN) return refuse("Photo storage is not set up here.", 500);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return refuse("No photo.");
    if (!/^image\//i.test(file.type)) return refuse("That is not a photo.");
    if (file.size > MAX_BYTES) return refuse("That photo is too big.");

    const blob = await put(`sub-photos/${crypto.randomUUID()}.jpg`, file, { access: "public", contentType: file.type || "image/jpeg", addRandomSuffix: false });
    if (String(form?.get("attach") ?? "") !== "1") {
      await addSitePhoto({
        subEmail: session.subcontractorEmail,
        subName: session.subcontractorName ?? "",
        accountId: String(form?.get("accountId") ?? "").trim().slice(0, 200),
        accountName: String(form?.get("accountName") ?? "").trim().slice(0, 300),
        moment: String(form?.get("moment") ?? "") === "before" ? "before" : "after",
        url: blob.url,
      });
    }
    return NextResponse.json({ success: true, url: blob.url });
  } catch (error) {
    console.error("[sub home photo POST]", error instanceof Error ? error.message : error);
    return refuse("The photo did not send.", 500);
  }
}
