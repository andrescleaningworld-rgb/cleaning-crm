import { NextRequest, NextResponse } from "next/server";
import {
  getAllSubcontractorVisits,
  logSubcontractorVisit,
  updateSubcontractorVisit,
  deleteSubcontractorVisit,
} from "@/lib/googleSheets";

export async function GET() {
  try {
    const visits = await getAllSubcontractorVisits();
    return NextResponse.json({ visits });
  } catch (err) {
    console.error("[admin/visits GET]", err);
    return NextResponse.json({ error: "Failed to load visits" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let body: {
    accountName?: string;
    subName?: string;
    subEmail?: string;
    visitDate?: string;
    arrivalTime?: string;
    notes?: string;
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { accountName, subName, subEmail, visitDate, arrivalTime, notes } = body;
  if (!accountName?.trim() || !visitDate?.trim() || !arrivalTime?.trim()) {
    return NextResponse.json({ error: "accountName, visitDate, and arrivalTime required" }, { status: 400 });
  }
  try {
    const visitId = await logSubcontractorVisit({
      accountName: accountName.trim(),
      subEmail: subEmail?.trim() ?? "",
      subName: subName?.trim() ?? "",
      visitDate: visitDate.trim(),
      arrivalTime: arrivalTime.trim(),
      notes: notes?.trim() ?? "",
    });
    return NextResponse.json({ success: true, visitId });
  } catch (err) {
    console.error("[admin/visits POST]", err);
    return NextResponse.json({ error: "Failed to add visit" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  let body: {
    sheetRow?: number;
    fields?: {
      accountName?: string;
      subName?: string;
      visitDate?: string;
      arrivalTime?: string;
      notes?: string;
    };
  };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { sheetRow, fields } = body;
  if (!sheetRow || !fields) {
    return NextResponse.json({ error: "sheetRow and fields required" }, { status: 400 });
  }
  try {
    await updateSubcontractorVisit(sheetRow, fields);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/visits PATCH]", err);
    return NextResponse.json({ error: "Failed to update visit" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  let body: { sheetRow?: number };
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.sheetRow) {
    return NextResponse.json({ error: "sheetRow required" }, { status: 400 });
  }
  try {
    await deleteSubcontractorVisit(body.sheetRow);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/visits DELETE]", err);
    return NextResponse.json({ error: "Failed to delete visit" }, { status: 500 });
  }
}
