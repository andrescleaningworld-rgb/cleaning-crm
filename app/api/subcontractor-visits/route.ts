import { NextRequest, NextResponse } from "next/server";
import { logSubcontractorVisit, getSubcontractorVisits } from "@/lib/googleSheets";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email")?.trim();
  const account = searchParams.get("account")?.trim();

  if (!email) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  try {
    const visits = await getSubcontractorVisits(email, account ?? undefined);
    return NextResponse.json({ visits });
  } catch (err) {
    console.error("[subcontractor-visits GET]", err);
    return NextResponse.json({ error: "Failed to load visits" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    accountName?: string;
    subEmail?: string;
    subName?: string;
    visitDate?: string;
    arrivalTime?: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { accountName, subEmail, subName, visitDate, arrivalTime, notes } = body;

  if (!accountName?.trim() || !subEmail?.trim() || !visitDate?.trim() || !arrivalTime?.trim()) {
    return NextResponse.json({ error: "accountName, subEmail, visitDate, and arrivalTime are required" }, { status: 400 });
  }

  // Reject future dates
  const todayStr = new Date().toISOString().slice(0, 10);
  if (visitDate.trim() > todayStr) {
    return NextResponse.json({ error: "Cannot log visits for future dates" }, { status: 400 });
  }

  try {
    const visitId = await logSubcontractorVisit({
      accountName: accountName.trim(),
      subEmail: subEmail.trim(),
      subName: subName?.trim() ?? "",
      visitDate: visitDate.trim(),
      arrivalTime: arrivalTime.trim(),
      notes: notes?.trim() ?? "",
    });
    return NextResponse.json({ success: true, visitId });
  } catch (err) {
    console.error("[subcontractor-visits POST]", err);
    return NextResponse.json({ error: "Failed to log visit" }, { status: 500 });
  }
}
