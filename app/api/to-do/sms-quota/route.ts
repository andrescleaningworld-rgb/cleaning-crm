import { NextResponse } from "next/server";
import { fetchLatestSmsQuota } from "@/lib/googleSheets";
import { SMS_LOW_QUOTA_THRESHOLD } from "@/lib/sms";

// Backs the /to-do low-quota banner. Reads the most recent SmsLog row that
// actually reported a quota (only successful sends do) rather than polling
// Textbelt directly — no new infrastructure beyond the SmsLog tab this
// already writes to on every send.
export async function GET() {
  try {
    const latest = await fetchLatestSmsQuota();

    if (!latest) {
      return NextResponse.json({ quotaRemaining: null, low: false });
    }

    return NextResponse.json({
      quotaRemaining: latest.quotaRemaining,
      low: latest.quotaRemaining < SMS_LOW_QUOTA_THRESHOLD,
    });
  } catch (error) {
    // Best-effort — a failure here should never block the to-do list from
    // rendering, so this fails soft rather than returning a 500.
    console.error("[sms] quota check failed:", error instanceof Error ? error.message : error);
    return NextResponse.json({ quotaRemaining: null, low: false });
  }
}
