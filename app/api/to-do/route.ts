import { NextRequest, NextResponse } from "next/server";
import { appendToDo, appendToDos, fetchToDos, updateToDoOutcome, updateToDoStatus } from "@/lib/googleSheets";

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
      const id = await appendToDo({
        dueDate: String(body.dueDate ?? ""),
        assignedTo: String(body.assignedTo ?? ""),
        accountName: String(body.accountName ?? ""),
        taskType: String(body.taskType ?? ""),
        why: String(body.why ?? ""),
        status: String(body.status || "Open"),
        notes: String(body.notes ?? ""),
        groupId: typeof body.groupId === "string" ? body.groupId : "",
      });

      return NextResponse.json({ success: true, id });
    }

    // One to-do per account, written as a single batched Sheets append —
    // see appendToDos' comment for why this can't be N separate addToDo
    // calls fired concurrently.
    if (action === "addToDos") {
      const accountNames = Array.isArray(body.accountNames)
        ? body.accountNames.map((name: unknown) => String(name)).filter(Boolean)
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

      const ids = await appendToDos(
        accountNames.map((accountName: string) => ({ ...shared, accountName }))
      );

      return NextResponse.json({ success: true, ids });
    }

    if (action === "updateToDoStatus") {
      const toDoId = String(body.toDoId ?? "");

      if (!toDoId) {
        return NextResponse.json(
          { success: false, message: "Missing toDoId." },
          { status: 400 }
        );
      }

      await updateToDoStatus(
        toDoId,
        String(body.status ?? ""),
        String(body.notes ?? "")
      );

      return NextResponse.json({ success: true });
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
