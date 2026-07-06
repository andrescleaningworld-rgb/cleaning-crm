import { NextRequest, NextResponse } from "next/server";
import { appendSubSchedule, fetchSubSchedules, updateSubSchedule } from "@/lib/googleSheets";

export async function GET() {
  try {
    const schedules = await fetchSubSchedules();
    return NextResponse.json({ schedules });
  } catch (err) {
    console.error("[admin/sub-schedules GET]", err);
    return NextResponse.json({ error: "Failed to load schedules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    accountId?: string;
    subId?: string;
    dayOfWeek?: string;
    timeWindow?: string;
    recurring?: string;
    effectiveStart?: string;
    effectiveEnd?: string;
    status?: string;
    submittedBy?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountId = body.accountId?.trim() ?? "";
  const subId = body.subId?.trim() ?? "";
  const dayOfWeek = body.dayOfWeek?.trim() ?? "";
  const timeWindow = body.timeWindow?.trim() ?? "";
  const recurring = body.recurring?.trim() ?? "";
  const submittedBy = body.submittedBy?.trim() ?? "";

  if (!accountId || !subId || !dayOfWeek || !timeWindow || !recurring || !submittedBy) {
    return NextResponse.json(
      { error: "accountId, subId, dayOfWeek, timeWindow, recurring, and submittedBy are required" },
      { status: 400 }
    );
  }

  try {
    const scheduleId = await appendSubSchedule({
      accountId,
      subId,
      dayOfWeek,
      timeWindow,
      recurring,
      effectiveStart: body.effectiveStart?.trim() ?? "",
      effectiveEnd: body.effectiveEnd?.trim() ?? "",
      status: body.status?.trim() || "Active",
      submittedBy,
    });
    return NextResponse.json({ success: true, scheduleId });
  } catch (err) {
    console.error("[admin/sub-schedules POST]", err);
    return NextResponse.json({ error: "Failed to create schedule" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: {
    sheetRow?: number;
    lastEditedBy?: string;
    fields?: Partial<{
      dayOfWeek: string;
      timeWindow: string;
      recurring: string;
      effectiveStart: string;
      effectiveEnd: string;
      status: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sheetRow = body.sheetRow;
  const lastEditedBy = body.lastEditedBy?.trim() ?? "";
  const fields = body.fields ?? {};

  if (!sheetRow || !lastEditedBy) {
    return NextResponse.json({ error: "sheetRow and lastEditedBy are required" }, { status: 400 });
  }

  try {
    await updateSubSchedule(sheetRow, {
      ...fields,
      lastEditedBy,
      lastEditedDate: new Date().toISOString(),
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/sub-schedules PATCH]", err);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}
