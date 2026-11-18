// Staff only (proxy.ts admin gate, and the logged-in check here): each
// account's customer portal use for Settings -> Customer Portal Access
// (lib/pg/portal-use.ts).
//
// GET -> { success, use: { [accountId]: { state, at, visits } }, lastSeenOn }
//   lastSeenOn: false until migration 083 is in ("last seen" not kept yet).

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { portalUseByAccount } from "@/lib/pg/portal-use";
import { getSql } from "@/lib/db";

export async function GET(request: NextRequest) {
  if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
  try {
    const [use, ready] = await Promise.all([portalUseByAccount(), getSql()`SELECT to_regclass('public.portal_seen') IS NOT NULL AS ok`]);
    return NextResponse.json({ success: true, use, lastSeenOn: (ready as { ok: boolean }[])[0]?.ok === true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[admin/portal-use]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "Portal use did not load." }, { status: 500 });
  }
}
