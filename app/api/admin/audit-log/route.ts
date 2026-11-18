// Owner-only Activity Log listing (gated by proxy.ts's OWNER_ONLY_PATHS).
// Three tabs: admin | sub | customer (lib/activityLog.ts listActivityFeed).
//
// GET ?tab=admin|sub|customer [&managerAccountId=] [&sub=] [&account=] [&start=] [&end=] [&offset=]
//       -> { success, entries, hasMore }       50 at a time, newest first
// GET ?counts=1&admin=<iso>&sub=<iso>&customer=<iso>
//       -> { success, counts }                 entries after each moment (the "new" badges)
// GET ?options=subs
//       -> { success, subs: [{ id, name }] }   the Subs tab's dropdown
import { NextRequest, NextResponse } from "next/server";
import { ACTIVITY_SOURCES, countActivitySince, listActivityFeed, listSubsForFilter, type ActivitySource } from "@/lib/activityLog";

const PAGE = 50;

export async function GET(request: NextRequest) {
  try {
    const params = new URL(request.url).searchParams;
    const get = (name: string) => params.get(name)?.trim() || undefined;

    if (params.get("options") === "subs") {
      return NextResponse.json({ success: true, subs: await listSubsForFilter() }, { headers: { "Cache-Control": "no-store" } });
    }

    if (params.get("counts") === "1") {
      const since: Partial<Record<ActivitySource, string>> = {};
      for (const tab of ACTIVITY_SOURCES) {
        const at = get(tab);
        if (at) since[tab] = at;
      }
      return NextResponse.json({ success: true, counts: await countActivitySince(since) }, { headers: { "Cache-Control": "no-store" } });
    }

    const tabParam = get("tab");
    const tab: ActivitySource = tabParam === "sub" || tabParam === "customer" ? tabParam : "admin";
    const { entries, hasMore } = await listActivityFeed({
      tab,
      actorAccountId: get("managerAccountId"),
      subId: get("sub"),
      accountId: get("account"),
      start: get("start"),
      end: get("end"),
      offset: Number(get("offset") ?? 0) || 0,
      limit: PAGE,
    });
    return NextResponse.json({ success: true, entries, hasMore }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/audit-log]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Could not load the activity log." }, { status: 500 });
  }
}
