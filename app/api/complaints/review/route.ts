// POST /api/complaints/review { keys: string[] }: what the printed Complaint
// Review needs for each complaint (address, when it was entered and fixed,
// its photos), by Complaint ID or row number (lib/pg/complaint-review.ts).
// Staff only. Read only.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { complaintReviewFacts } from "@/lib/pg/complaint-review";

const noStore = { headers: { "Cache-Control": "no-store" } };
const MAX_KEYS = 1000;

export async function POST(request: NextRequest) {
  try {
    if (!(await getAdminIdentity(request))) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401, ...noStore });
    const body = (await request.json().catch(() => ({}))) as { keys?: unknown };
    const keys = Array.isArray(body.keys) ? body.keys.map((key) => String(key ?? "").trim()).filter(Boolean).slice(0, MAX_KEYS) : [];
    const facts = await complaintReviewFacts(keys);
    return NextResponse.json({ success: true, facts }, noStore);
  } catch (error) {
    console.error("[complaints/review POST]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The review details did not load." }, { status: 500, ...noStore });
  }
}
