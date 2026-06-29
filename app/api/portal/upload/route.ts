import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { sessionOptions, type PortalSessionData } from "@/lib/portalSession";
import { uploadPhotoToDrive, validatePhoto } from "@/lib/googleDrive";

export async function POST(request: NextRequest) {
  const session = await getIronSession<PortalSessionData>(
    await cookies(),
    sessionOptions()
  );
  if (!session.accountId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const validationError = validatePhoto(file);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadPhotoToDrive(buffer, file.name, file.type, session.accountId);
    return NextResponse.json({ success: true, url });
  } catch (err) {
    console.error("[portal/upload]", err);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
