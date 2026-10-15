// Active accounts with no Sub Schedule. Staff only (proxy.ts default gate,
// and the staff session is checked here). See lib/pg/no-schedule.ts.
//   GET                 every such account, sorted by sub
//   GET ?accountId=…    { account } when this account is one of them, else { account: null }

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { accountWithoutSchedule, addScheduleHref, listAccountsWithoutSchedule } from "@/lib/pg/no-schedule";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    const accountId = (request.nextUrl.searchParams.get("accountId") ?? "").trim();
    if (accountId) {
      const account = await accountWithoutSchedule(accountId);
      return NextResponse.json({ success: true, account: account ? { ...account, addHref: addScheduleHref(account) } : null }, noStore);
    }
    const accounts = (await listAccountsWithoutSchedule()).map((account) => ({ ...account, addHref: addScheduleHref(account) }));
    return NextResponse.json({ success: true, accounts }, noStore);
  } catch (error) {
    console.error("[no-schedule GET]", error instanceof Error ? error.message : error);
    return refuse("The list did not load.", 500);
  }
}
