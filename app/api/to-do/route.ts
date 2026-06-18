import { NextRequest, NextResponse } from "next/server";

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export async function GET() {
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
        todos: [],
      },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getToDos`, {
      cache: "no-store",
    });

    const text = await response.text();

    try {
      const data = JSON.parse(text);

      return NextResponse.json({
        success: Boolean(data.success),
        todos: Array.isArray(data.todos)
          ? data.todos
          : Array.isArray(data.data)
            ? data.data
            : [],
        message: data.message || "",
      });
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Google Script did not return valid JSON.",
          raw: text,
          todos: [],
        },
        { status: 500 }
      );
    }
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
  if (!GOOGLE_SCRIPT_URL) {
    return NextResponse.json(
      {
        success: false,
        message: "GOOGLE_SCRIPT_URL is missing.",
      },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();

    const action =
      typeof body.action === "string" && body.action
        ? body.action
        : "addToDo";

    const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    const text = await response.text();

    try {
      const data = JSON.parse(text);
      return NextResponse.json(data);
    } catch {
      return NextResponse.json(
        {
          success: false,
          message: "Google Script did not return valid JSON.",
          raw: text,
        },
        { status: 500 }
      );
    }
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