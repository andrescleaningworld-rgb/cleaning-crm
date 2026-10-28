// "Hide from customer" on one crew photo: the customer portal's Photos stops
// (or starts again) showing it (lib/pg/crew-photos.ts, migration 064).
// Staff only (proxy.ts default gate, and the staff session is checked here).

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { crewPhotosReady, setPhotoHiddenFromCustomer } from "@/lib/pg/crew-photos";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

export async function POST(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Staff only.", 401);
    if (!(await crewPhotosReady())) return refuse("Crew photos are not turned on here yet.", 409);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return refuse("Which photo?");
    if (!(await setPhotoHiddenFromCustomer(id, body.hidden === true))) return refuse("Only a crew photo can be hidden from the customer.", 409);
    return NextResponse.json({ success: true, hidden: body.hidden === true });
  } catch (error) {
    console.error("[photo-index hide POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
