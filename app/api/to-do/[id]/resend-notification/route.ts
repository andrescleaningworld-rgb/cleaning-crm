import { NextRequest, NextResponse } from "next/server";
import { fetchSmsLogForToDo, fetchToDos } from "@/lib/googleSheets";
import type { ToDoCalendarInput } from "@/lib/googleCalendar";
import { notifyManagerOfNewToDo } from "@/app/api/to-do/route";

type RouteContext = { params: Promise<{ id: string }> };

const TERMINAL_STATUSES = new Set(["DELIVERED", "FAILED"]);
const RATE_LIMIT_MS = 30_000;

// Re-invokes the exact same lookup/send/log path notifyManagerOfNewToDo
// uses at creation time (imported, not duplicated), writing a NEW SmsLog
// row rather than overwriting the prior attempt — full history stays
// intact for the badge and for this rate limit itself. Awaited directly
// (no after() wrapper): unlike creation, where SMS is a side effect that
// shouldn't slow down saving the to-do, sending the notification IS this
// route's entire job, so the caller should get a real result to act on.
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const toDoId = decodeURIComponent(id);

    const [todos, priorAttempts] = await Promise.all([
      fetchToDos(),
      fetchSmsLogForToDo(toDoId),
    ]);

    const todo = todos.find((t) => t.id === toDoId);
    if (!todo) {
      return NextResponse.json({ success: false, message: "To-do not found." }, { status: 404 });
    }

    const latest = priorAttempts[0]; // fetchSmsLogForToDo sorts most-recent-first
    if (latest) {
      const sentMs = Date.parse(latest.sentAt);
      const isTerminal = TERMINAL_STATUSES.has(latest.status.toUpperCase());
      if (!isTerminal && Number.isFinite(sentMs) && Date.now() - sentMs < RATE_LIMIT_MS) {
        return NextResponse.json(
          {
            success: false,
            message: "A notification attempt for this to-do was just sent — wait a moment before resending.",
          },
          { status: 429 }
        );
      }
    }

    const input: ToDoCalendarInput = {
      dueDate: todo.dueDate,
      assignedTo: todo.assignedTo,
      accountName: todo.accountName,
      taskType: todo.taskType,
      why: todo.why,
      status: todo.status,
      notes: todo.notes,
      syncToCalendar: todo.syncToCalendar ?? true,
    };

    await notifyManagerOfNewToDo(toDoId, input, new URL(request.url).origin);

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : "Failed to resend notification.",
      },
      { status: 500 }
    );
  }
}
