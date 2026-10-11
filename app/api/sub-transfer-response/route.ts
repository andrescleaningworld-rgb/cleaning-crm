// The Accept / Decline buttons in a transfer proposal email open this
// address (it used to be the Apps Script web app). No login: the person
// tapping is a subcontractor reading their email, exactly as before. It
// records the answer, tells the office, and shows the thank-you page.
// Listed in proxy.ts PUBLIC_PATHS. Only answers when
// DATA_SOURCE_SUB_TRANSFERS=postgres.

import { NextRequest, NextResponse } from "next/server";
import { isPostgres } from "@/lib/dataSource";
import { respondSubTransferProposal } from "@/lib/pg/sub-transfers";

const html = (body: string, status = 200) =>
  new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>Cleaning World</title></head><body style="margin:0;">${body}</body></html>`, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });

export async function GET(request: NextRequest) {
  if (!isPostgres("SUB_TRANSFERS")) return html("<h2>Not available</h2><p>Please contact Cleaning World.</p>", 404);
  const params = request.nextUrl.searchParams;
  return html(
    await respondSubTransferProposal({
      proposalId: params.get("proposalId") ?? undefined,
      id: params.get("id") ?? undefined,
      response: params.get("response") ?? undefined,
      status: params.get("status") ?? undefined,
    })
  );
}
