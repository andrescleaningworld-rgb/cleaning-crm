// "Find emails in Markate" on Accounts Center → Missing emails
// (lib/pg/markate-emails.ts). Read only: saving is the usual
// POST /api/admin/account-emails, one account at a time, for the ones staff
// tick. Staff only (proxy.ts, and the logged-in check here).
//
// GET ?accounts=1                      the accounts with no email (name, address, zip, phone)
// GET ?status=1|4|3&page=N&size=S      a run of Markate customer pages for one status (cut down for matching)
// GET ?search=1&start=N                the backup search: accounts N… looked up one by one

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { isPostgres } from "@/lib/dataSource";
import { MARKATE_STATUSES, customerPages, missingAccountRows, searchRound, type MarkateStatus } from "@/lib/pg/markate-emails";

// A run of pages, under Markate's call limit.
export const maxDuration = 300;

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status: number) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (!isPostgres("ACCOUNTS")) return refuse("This works once accounts are on the new database.", 409);
    const params = request.nextUrl.searchParams;

    if (params.get("accounts") === "1") return NextResponse.json({ success: true, accounts: await missingAccountRows() }, noStore);

    if (params.get("search") === "1") {
      const result = await searchRound(Math.max(0, Math.floor(Number(params.get("start")) || 0)));
      return "error" in result ? refuse(result.error, 409) : NextResponse.json({ success: true, ...result }, noStore);
    }

    const status = params.get("status") as MarkateStatus | null;
    if (status && (MARKATE_STATUSES as readonly string[]).includes(status)) {
      const page = Math.max(1, Math.floor(Number(params.get("page")) || 1));
      const size = Math.min(100, Math.max(10, Math.floor(Number(params.get("size")) || 50)));
      const result = await customerPages(status, page, size);
      return "error" in result ? refuse(result.error, 409) : NextResponse.json({ success: true, ...result }, noStore);
    }
    return refuse("Say what to read.", 400);
  } catch (error) {
    console.error("[account-emails/markate]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "Markate did not answer.", 500);
  }
}
