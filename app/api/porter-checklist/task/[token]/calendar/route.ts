// Public, no-login route: "Add to my calendar" on the sub's task screen. The
// .ics file for this one task.

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { isTaskToken } from "@/lib/cwNowTasks";
import { cwNowTasksReady, taskCalendarFile } from "@/lib/pg/cw-now-tasks";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    if (!isTaskToken(token) || !(await cwNowTasksReady())) return new NextResponse("Not available.", { status: 404 });
    if (!(await checkRateLimit(`cwnow-task-ics:${token}`))) return new NextResponse("Too many requests.", { status: 429 });
    const file = await taskCalendarFile(token);
    if (!file) return new NextResponse("Not available.", { status: 404 });
    return new NextResponse(file, {
      headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": 'inline; filename="cleaning-world-task.ics"', "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[cw-now task calendar]", error instanceof Error ? error.message : error);
    return new NextResponse("Something went wrong.", { status: 500 });
  }
}
