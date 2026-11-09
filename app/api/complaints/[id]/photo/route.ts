// POST /api/complaints/<id>/photo (one file, form field "file"): an "after"
// photo for closing a complaint (lib/complaintFixPhotos.ts). Staff only.
// The photo is only attached to the complaint when it is closed with it.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { complaintRowId } from "@/lib/pg/complaint-events";
import { saveFixPhoto } from "@/lib/complaintFixPhotos";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
  const key = decodeURIComponent((await context.params).id);
  if ((await complaintRowId(key)) === null) return NextResponse.json({ success: false, error: "Complaint not found." }, { status: 404 });
  const form = await request.formData().catch(() => null);
  try {
    const url = await saveFixPhoto(key, form?.get("file"));
    return NextResponse.json({ success: true, url });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    console.error("[complaints photo]", message);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
