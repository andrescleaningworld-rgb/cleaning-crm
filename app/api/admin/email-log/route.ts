// The Email log (lib/pg/email-log.ts). Staff only (proxy.ts default gate,
// plus a logged-in check here).
//
// GET ?q=&type=&subId=&subEmail=&accountId=&offset=   newest first, 100 at a time
// GET ?id=123                                         one email with exactly what was sent

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { emailLogReady, getEmailLogEntry, listEmailLog } from "@/lib/pg/email-log";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (!(await emailLogReady())) return NextResponse.json({ success: true, ready: false, rows: [], total: 0, types: [] }, noStore);
    const params = request.nextUrl.searchParams;
    const id = Number(params.get("id"));
    if (params.get("id")) {
      if (!Number.isInteger(id)) return refuse("That email was not found.", 404);
      const entry = await getEmailLogEntry(id);
      return entry ? NextResponse.json({ success: true, ready: true, entry }, noStore) : refuse("That email was not found.", 404);
    }
    const list = await listEmailLog({
      q: params.get("q") ?? "",
      type: params.get("type") ?? "",
      subId: params.get("subId") ?? "",
      subEmail: params.get("subEmail") ?? "",
      accountId: params.get("accountId") ?? "",
      offset: Number(params.get("offset") ?? 0) || 0,
    });
    return NextResponse.json({ success: true, ready: true, ...list }, noStore);
  } catch (error) {
    console.error("[email-log GET]", error instanceof Error ? error.message : error);
    return refuse("The email log did not load.", 500);
  }
}
