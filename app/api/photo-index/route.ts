// The Photos page's data: every photo in the app from the photo index, by
// account, issue and date. Staff only: this path is not on any public list in
// proxy.ts, so subs and customers are turned away before it runs, and it
// checks the staff session itself as well. Answers { on: false } where
// FEATURE_PHOTOS is off or the index table is not in this database.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { listPhotos, photoAccounts, photoCounts, photosReady, syncPhotoIndex } from "@/lib/pg/photo-index";

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Staff only." }, { status: 401 });
    if (!(await photosReady())) return NextResponse.json({ success: true, on: false });
    const params = new URL(request.url).searchParams;
    if (params.get("flag") === "1") return NextResponse.json({ success: true, on: true });
    const first = !params.get("beforeAt");
    // New photos saved anywhere in the app are picked up here (at most once a minute).
    if (first) await syncPhotoIndex().catch(() => undefined);
    const [list, counts, accounts] = await Promise.all([
      listPhotos({
        search: params.get("q") ?? "",
        account: params.get("account") ?? "",
        accountId: params.get("accountId") ?? "",
        kind: params.get("kind") ?? "",
        group: params.get("group") ?? "",
        from: params.get("from") ?? "",
        to: params.get("to") ?? "",
        beforeAt: params.get("beforeAt") ?? "",
        beforeId: Number(params.get("beforeId") ?? NaN),
        limit: Number(params.get("limit") ?? 60) || 60,
      }),
      first ? photoCounts(params.get("weekStart") ?? undefined) : Promise.resolve(null),
      first ? photoAccounts() : Promise.resolve(null),
    ]);
    return NextResponse.json({ success: true, on: true, ...list, counts, accounts }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[photo-index GET]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The photos did not load." }, { status: 500 });
  }
}
