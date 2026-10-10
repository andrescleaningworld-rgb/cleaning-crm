// The picture of a Google Drive photo that was added with "Add photos ->
// From Google Drive". Such a file may be shared only with the app's Google
// account, so the browser cannot load it from Drive directly: this asks Drive
// (read-only) for a short-lived picture link and sends the browser there.
// Staff only, and only for files that are in the photo index.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import { driveThumbnail } from "@/lib/photoImport";
import { photosReady } from "@/lib/pg/photo-index";

export async function GET(request: NextRequest) {
  if (!(await getAdminIdentity(request))) return new NextResponse(null, { status: 401 });
  if (!(await photosReady())) return new NextResponse(null, { status: 404 });
  const params = new URL(request.url).searchParams;
  const fileId = (params.get("file") ?? "").trim();
  const size = Math.min(1600, Math.max(100, Number(params.get("s")) || 400));
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) return new NextResponse(null, { status: 400 });
  const known = (await getSql().query(`SELECT 1 FROM photo_index WHERE source_key = $1`, [`drive-import:${fileId}`])) as unknown[];
  if (known.length === 0) return new NextResponse(null, { status: 404 });
  const link = await driveThumbnail(fileId, size);
  if (!link) return new NextResponse(null, { status: 404 });
  return NextResponse.redirect(link, { status: 302, headers: { "Cache-Control": "private, max-age=600" } });
}
