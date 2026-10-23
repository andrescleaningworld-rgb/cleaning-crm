// Price increase reminders for one account (lib/pg/price-review.ts). Staff
// only (proxy.ts default gate, plus a logged-in check here). Dates only: no
// money goes in or out.
//
// GET ?accountId=                                   the review: last change, due, snooze
// GET ?all=1                                        every account due for a review ("Overdue price reviews")
// POST { accountId, action: "setDate", day }        "The price last changed on…"
// POST { accountId, action: "snooze", months, reason }   3 or 6 months, written to History

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { SNOOZE_MONTHS, type SnoozeMonths } from "@/lib/priceReview";
import { looseDate } from "@/lib/subInsurance";
import { accountPriceReview, listDuePriceReviews, setLastPriceChange, snoozePriceReview } from "@/lib/pg/price-review";

const noStore = { headers: { "Cache-Control": "no-store" } };
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, ...noStore });

export async function GET(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return refuse("Log in first.", 401);
    if (request.nextUrl.searchParams.get("all") === "1") return NextResponse.json({ success: true, due: await listDuePriceReviews() }, noStore);
    const accountId = request.nextUrl.searchParams.get("accountId")?.trim() ?? "";
    if (!accountId) return refuse("accountId is required.");
    return NextResponse.json({ success: true, review: await accountPriceReview(accountId) }, noStore);
  } catch (error) {
    console.error("[price-review GET]", error instanceof Error ? error.message : error);
    return refuse("The price review did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = identity.name || "Someone";
    const actor = identity.accountId ?? null;
    const body = (await request.json().catch(() => ({}))) as { accountId?: unknown; action?: unknown; day?: unknown; months?: unknown; reason?: unknown };
    const accountId = String(body.accountId ?? "").trim();
    if (!(await accountPriceReview(accountId))) return refuse("Only an active account with a price has a price review.", 404);

    if (body.action === "setDate") {
      const day = looseDate(body.day);
      if (!day) return refuse("Pick the date.");
      await setLastPriceChange(accountId, day, by, actor);
    } else if (body.action === "snooze") {
      const months = Number(body.months) as SnoozeMonths;
      const reason = String(body.reason ?? "").trim().slice(0, 300);
      if (!SNOOZE_MONTHS.includes(months)) return refuse("Snooze 3 or 6 months.");
      if (!reason) return refuse("Write why. It goes in History.");
      await snoozePriceReview(accountId, months, reason, by, actor);
    } else {
      return refuse("Unknown action.");
    }
    return NextResponse.json({ success: true, review: await accountPriceReview(accountId) }, noStore);
  } catch (error) {
    console.error("[price-review POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error ? error.message : "That did not save. Try again.", 500);
  }
}
