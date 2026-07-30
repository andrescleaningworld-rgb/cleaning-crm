import { NextRequest, NextResponse } from "next/server";
import { appendToDo, appendToDos, fetchToDos, setToDoCalendarSyncFailed, updateToDoOutcome, updateToDoStatus } from "@/lib/googleSheets";
import { createCalendarEventForToDo, updateCalendarEventForToDo, type ToDoCalendarInput } from "@/lib/googleCalendar";

export async function GET() {
  try {
    const todos = await fetchToDos();

    // Deliberately uncached: this list is expected to reflect a create/
    // status-update immediately after the action that caused it, and an
    // HTTP-cached response here previously made just-created to-dos look
    // like they hadn't saved.
    return NextResponse.json({
      success: true,
      todos,
      message: "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to load to-dos.",
        todos: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const action =
      typeof body.action === "string" && body.action
        ? body.action
        : "addToDo";

    if (action === "addToDo") {
      const input: ToDoCalendarInput = {
        dueDate: String(body.dueDate ?? ""),
        assignedTo: String(body.assignedTo ?? ""),
        accountName: String(body.accountName ?? ""),
        taskType: String(body.taskType ?? ""),
        why: String(body.why ?? ""),
        status: String(body.status || "Open"),
        notes: String(body.notes ?? ""),
      };

      // Calendar event is created BEFORE the Sheets row so its id (and
      // whether the sync failed) can be written in the same append — see
      // appendToDo's calendarEventId comment for why this avoids a second
      // write-back step. Best-effort: createCalendarEventForToDo never
      // throws, so a Calendar failure still lets the to-do itself save.
      const { eventId: calendarEventId, failed: calendarSyncFailed } = await createCalendarEventForToDo(input);

      const id = await appendToDo({
        ...input,
        groupId: typeof body.groupId === "string" ? body.groupId : "",
        calendarEventId: calendarEventId ?? "",
        calendarSyncFailed,
      });

      return NextResponse.json({ success: true, id, calendarSyncFailed });
    }

    // One to-do per account, written as a single batched Sheets append —
    // see appendToDos' comment for why this can't be N separate addToDo
    // calls fired concurrently. An empty-string entry is valid here (a
    // Reminder with no account attached still writes one row, just with
    // a blank ACCOUNT column) — only a missing/empty array is rejected.
    if (action === "addToDos") {
      const accountNames: string[] = Array.isArray(body.accountNames)
        ? body.accountNames.map((name: unknown) => String(name))
        : [];

      if (accountNames.length === 0) {
        return NextResponse.json(
          { success: false, message: "No accounts provided." },
          { status: 400 }
        );
      }

      const shared = {
        dueDate: String(body.dueDate ?? ""),
        assignedTo: String(body.assignedTo ?? ""),
        taskType: String(body.taskType ?? ""),
        why: String(body.why ?? ""),
        status: String(body.status || "Open"),
        notes: String(body.notes ?? ""),
        groupId: typeof body.groupId === "string" ? body.groupId : "",
      };

      const entries: (ToDoCalendarInput & { groupId: string })[] = accountNames.map((accountName) => ({
        ...shared,
        accountName,
      }));

      // Independent Calendar API calls (unlike Sheets appends, creating N
      // separate events has no shared-row race to worry about), so these
      // run in parallel rather than needing the single-request batching
      // appendToDos itself requires.
      const calendarResults = await Promise.all(
        entries.map((entry: ToDoCalendarInput) => createCalendarEventForToDo(entry))
      );

      const ids = await appendToDos(
        entries.map((entry: ToDoCalendarInput & { groupId: string }, index: number) => ({
          ...entry,
          calendarEventId: calendarResults[index].eventId ?? "",
          calendarSyncFailed: calendarResults[index].failed,
        }))
      );

      return NextResponse.json({
        success: true,
        ids,
        calendarSyncFailed: calendarResults.some((result) => result.failed),
      });
    }

    if (action === "updateToDoStatus") {
      const toDoId = String(body.toDoId ?? "");

      if (!toDoId) {
        return NextResponse.json(
          { success: false, message: "Missing toDoId." },
          { status: 400 }
        );
      }

      const status = String(body.status ?? "");

      const { accountName, why, calendarEventId } = await updateToDoStatus(
        toDoId,
        status,
        String(body.notes ?? "")
      );

      let calendarSyncFailed = false;
      if (calendarEventId) {
        const result = await updateCalendarEventForToDo(calendarEventId, accountName, why, status);
        calendarSyncFailed = result.failed;
        await setToDoCalendarSyncFailed(toDoId, calendarSyncFailed);
      }

      return NextResponse.json({ success: true, calendarSyncFailed });
    }

    if (action === "updateToDoOutcome") {
      const toDoId = String(body.toDoId ?? "");

      if (!toDoId) {
        return NextResponse.json(
          { success: false, message: "Missing toDoId." },
          { status: 400 }
        );
      }

      await updateToDoOutcome(toDoId, String(body.outcome ?? ""));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, message: `Unsupported action "${action}".` },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to save to-do.",
      },
      { status: 500 }
    );
  }
}
