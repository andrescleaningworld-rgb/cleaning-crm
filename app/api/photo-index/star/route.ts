// The "Show on TV" star on a photo: starred photos are the TV slideshow.
// Staff only (proxy.ts default gate, and the staff session is checked here).

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { photosReady } from "@/lib/pg/photo-index";
import { setShowOnTv } from "@/lib/pg/office-events";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Staff only.", 401);
    if (!(await photosReady())) return refuse("Photos is not turned on here.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return refuse("Which photo?");
    const saved = await setShowOnTv(id, body.on === true);
    if (!saved) return refuse("The star could not be saved here yet.", 409);
    return NextResponse.json({ success: true, on: body.on === true });
  } catch (error) {
    console.error("[photo-index star POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
