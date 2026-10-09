// Staff: the before / after photos subcontractors took at one account from
// the portal home (newest first). Staff only (proxy.ts default gate).
// Answers an empty list where the sub home is not turned on.

import { NextRequest, NextResponse } from "next/server";
import { sitePhotos, subHomeReady } from "@/lib/pg/sub-home";

export async function GET(request: NextRequest) {
  try {
    if (!(await subHomeReady())) return NextResponse.json({ success: true, on: false, photos: [] });
    const params = new URL(request.url).searchParams;
    const photos = await sitePhotos((params.get("accountId") ?? "").trim(), (params.get("accountName") ?? "").trim());
    return NextResponse.json({ success: true, on: true, photos }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[handoffs/photos GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: true, on: false, photos: [] });
  }
}
