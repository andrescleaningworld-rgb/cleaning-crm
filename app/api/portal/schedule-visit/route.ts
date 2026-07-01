import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { listPortalAccounts, updatePortalAccountFields } from "@/lib/googleSheets";

const VISITS_SHEET_ID = "10MDGlN8pVKVcthd2MA5ygsBLVI3nN3DF98i_cF-Pqjs";
const VISITS_TAB = "Visits";

const VALID_WINDOWS = ["Morning", "Midday", "Afternoon", "Evening"] as const;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatLabel(date: string, timeWindow: string): string {
  const parts = date.split("-");
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  return `${MONTH_NAMES[month]} ${day} - ${timeWindow}`;
}

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

export async function POST(request: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const accountName = typeof body.accountName === "string" ? body.accountName.trim() : "";
    const accountId   = typeof body.accountId   === "string" ? body.accountId.trim()   : "";
    const subEmail    = typeof body.subEmail    === "string" ? body.subEmail.trim()    : "";
    const subName     = typeof body.subName     === "string" ? body.subName.trim()     : "";
    const timeWindow  = typeof body.timeWindow  === "string" ? body.timeWindow.trim()  : "";

    // Accept either visitDates[] (new) or visitDate (legacy single)
    let visitDates: string[];
    if (Array.isArray(body.visitDates)) {
      visitDates = (body.visitDates as unknown[])
        .filter((d): d is string => typeof d === "string" && d.trim().length > 0)
        .map((d) => d.trim());
    } else if (typeof body.visitDate === "string" && body.visitDate.trim()) {
      visitDates = [body.visitDate.trim()];
    } else {
      visitDates = [];
    }

    if (!accountName || !subEmail || !timeWindow || visitDates.length === 0) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!(VALID_WINDOWS as readonly string[]).includes(timeWindow)) {
      return NextResponse.json({ error: "Invalid time window" }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const invalidDate = visitDates.find((d) => d <= today);
    if (invalidDate) {
      return NextResponse.json({ error: "All dates must be in the future" }, { status: 400 });
    }

    console.log("[portal/schedule-visit] DIAGNOSTIC env check:", {
      hasServiceAccountEmail: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL),
      serviceAccountEmailLength: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.length ?? 0,
      hasPrivateKey: Boolean(process.env.GOOGLE_PRIVATE_KEY),
      privateKeyLength: process.env.GOOGLE_PRIVATE_KEY?.length ?? 0,
    });

    const auth = getAuth();
    const sheets = google.sheets({ version: "v4", auth });
    const submittedAt = new Date().toISOString();

    // Sort dates so the first one is earliest (for the label)
    const sortedDates = [...visitDates].sort();
    const scheduleLabel = formatLabel(sortedDates[0], timeWindow);

    // Batch-append all visit dates in one API call
    await sheets.spreadsheets.values.append({
      spreadsheetId: VISITS_SHEET_ID,
      range: `${VISITS_TAB}!A:A`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: sortedDates.map((date) => [
          submittedAt,
          accountName,
          accountId,
          subName,
          subEmail,
          date,
          timeWindow,
          "Scheduled",
          "Portal",
        ]),
      },
    });

    // Update Next Scheduled Service on the customer-portal sheet (first/earliest date)
    const portalAccounts = await listPortalAccounts();
    const match = portalAccounts.find(
      (a) => a.accountName.trim().toLowerCase() === accountName.toLowerCase(),
    );

    if (match) {
      await updatePortalAccountFields(match.sheetRow, {
        nextScheduledService: scheduleLabel,
      });
    }

    return NextResponse.json({ success: true, scheduleLabel, count: sortedDates.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error("[portal/schedule-visit] Unhandled error:", { message, stack, raw: err });
    return NextResponse.json({ error: "Failed to save schedule" }, { status: 500 });
  }
}
