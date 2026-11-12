// Every 15 minutes (vercel.json): the to-do due-day reminders to the assigned
// manager, push + text: 8 AM on the due day, and 1 hour before a to-do that
// has a time (lib/pg/todo-reminders.ts). Vercel Cron calls it with
// CRON_SECRET (/api/cron is public in proxy.ts).

import { NextRequest, NextResponse } from "next/server";
import { runTodoReminders } from "@/lib/pg/todo-reminders";

export const maxDuration = 120;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, result: await runTodoReminders(new URL(request.url).origin) });
  } catch (error) {
    console.error("[cron todo-reminders]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The to-do reminders did not run." }, { status: 500 });
  }
}
