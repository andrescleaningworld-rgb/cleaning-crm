import { NextResponse } from "next/server";
import { fetchScheduleExceptions } from "@/lib/googleSheets";

export async function GET() {
  try {
    const exceptions = await fetchScheduleExceptions();
    return NextResponse.json({ exceptions });
  } catch (err) {
    console.error("[subcontractor-schedule-exceptions GET]", err);
    return NextResponse.json({ error: "Failed to load schedule exceptions" }, { status: 500 });
  }
}
