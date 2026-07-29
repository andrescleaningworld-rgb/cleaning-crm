import { NextRequest, NextResponse } from "next/server";
import { appendToDo, fetchToDos, updateToDoStatus } from "@/lib/googleSheets";

export async function GET() {
  try {
    const todos = await fetchToDos();

    return NextResponse.json(
      {
        success: true,
        todos,
        message: "",
      },
      {
        headers: {
          "Cache-Control": "public, max-age=20, stale-while-revalidate=40",
        },
      }
    );
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
