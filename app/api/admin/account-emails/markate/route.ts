// GET /api/admin/account-emails/markate: "Find emails in Markate" on
// Accounts Center → Missing emails (lib/pg/markate-emails.ts). Read only:
// it returns the matches; saving is the usual POST /api/admin/account-emails,
// one account at a time, for the ones staff tick. Staff only (proxy.ts, and
// the logged-in check here).

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { isPostgres } from "@/lib/dataSource";
import { findMarkateEmails } from "@/lib/pg/markate-emails";

// Reading every Markate customer, under Markate's call limit.
export const maxDuration = 300;

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401, ...noStore });
    if (!isPostgres("ACCOUNTS")) return NextResponse.json({ success: false, error: "This works once accounts are on the new database." }, { status: 409, ...noStore });
    const result = await findMarkateEmails();
    if ("error" in result) return NextResponse.json({ success: false, error: result.error }, { status: 409, ...noStore });
    return NextResponse.json({ success: true, ...result }, noStore);
  } catch (error) {
    console.error("[account-emails/markate]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Markate did not answer." }, { status: 500, ...noStore });
  }
}
