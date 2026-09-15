// Admin-gated by the default proxy.ts cookie check, PLUS an explicit shared
// password on top (CHECKLIST_SUBMISSIONS_PASSWORD) — per spec, staff who are
// logged into the CRM but don't have this separate password still can't
// list submissions. Porters never reach this route at all (their surface is
// app/api/porter-checklist/route.ts, which is public and has no read-list
// capability).
import { NextRequest, NextResponse } from "next/server";
import { fetchAllMainAccounts } from "@/lib/googleSheets";
import { getSubmissionDetail, listSubmissions } from "@/lib/checklistDb";

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CHECKLIST_SUBMISSIONS_PASSWORD || "";
  if (!expected) return false;
  const provided = request.headers.get("x-checklist-password") || "";
  return provided === expected;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: "Incorrect password." }, { status: 401 });
  }

  try {
    const url = new URL(request.url);
    const accountId = url.searchParams.get("accountId")?.trim() || undefined;
    const detailId = url.searchParams.get("id");

    if (detailId) {
      const detail = await getSubmissionDetail(Number(detailId));
      if (!detail) {
        return NextResponse.json({ success: false, error: "Submission not found." }, { status: 404 });
      }
      return NextResponse.json({ success: true, detail });
    }

    const [submissions, accounts] = await Promise.all([listSubmissions(accountId), fetchAllMainAccounts()]);
    const flaggedAccounts = accounts
      .filter((a) => a.checklistNeeded)
      .map((a) => ({ accountId: a.accountId, accountName: a.accountName }));

    return NextResponse.json({ success: true, submissions, flaggedAccounts });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load submissions." },
      { status: 500 }
    );
  }
}
