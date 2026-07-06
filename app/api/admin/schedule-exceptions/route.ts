import { NextRequest, NextResponse } from "next/server";
import {
  appendScheduleException,
  deleteScheduleException,
  fetchScheduleExceptions,
  updateScheduleException,
} from "@/lib/googleSheets";

export async function GET() {
  try {
    const exceptions = await fetchScheduleExceptions();
    return NextResponse.json({ exceptions });
  } catch (err) {
    console.error("[admin/schedule-exceptions GET]", err);
    return NextResponse.json({ error: "Failed to load exceptions" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    accountId?: string;
    originalDate?: string;
    type?: string;
    newDate?: string;
    newTimeWindow?: string;
    reason?: string;
    createdBy?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const accountId = body.accountId?.trim() ?? "";
  const originalDate = body.originalDate?.trim() ?? "";
  const type = body.type?.trim() ?? "";
  const createdBy = body.createdBy?.trim() ?? "";

  if (!accountId || !originalDate || !type || !createdBy) {
    return NextResponse.json(
      { error: "accountId, originalDate, type, and createdBy are required" },
      { status: 400 }
    );
  }

  try {
    const exceptionId = await appendScheduleException({
      accountId,
      originalDate,
      type,
      newDate: body.newDate?.trim() ?? "",
      newTimeWindow: body.newTimeWindow?.trim() ?? "",
      reason: body.reason?.trim() ?? "",
      createdBy,
    });
    return NextResponse.json({ success: true, exceptionId });
  } catch (err) {
    console.error("[admin/schedule-exceptions POST]", err);
    return NextResponse.json({ error: "Failed to create exception" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: {
    sheetRow?: number;
    fields?: Partial<{
      originalDate: string;
      type: string;
      newDate: string;
      newTimeWindow: string;
      reason: string;
    }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sheetRow = body.sheetRow;
  const fields = body.fields ?? {};

  if (!sheetRow) {
    return NextResponse.json({ error: "sheetRow is required" }, { status: 400 });
  }

  try {
    await updateScheduleException(sheetRow, fields);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/schedule-exceptions PATCH]", err);
    return NextResponse.json({ error: "Failed to update exception" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: { sheetRow?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.sheetRow) {
    return NextResponse.json({ error: "sheetRow is required" }, { status: 400 });
  }

  try {
    await deleteScheduleException(body.sheetRow);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/schedule-exceptions DELETE]", err);
    return NextResponse.json({ error: "Failed to delete exception" }, { status: 500 });
  }
}
