import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "cw_admin_session";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      password?: string;
    };

    const password = String(body.password || "");
    const expectedPassword = process.env.ADMIN_PASSWORD || "";
    const sessionToken = process.env.ADMIN_SESSION_TOKEN || "";

    if (!expectedPassword || !sessionToken) {
      return NextResponse.json(
        {
          success: false,
          message:
            "Login is not configured. Missing ADMIN_PASSWORD or ADMIN_SESSION_TOKEN.",
        },
        { status: 500 }
      );
    }

    if (password !== expectedPassword) {
      return NextResponse.json(
        {
          success: false,
          message: "Incorrect password.",
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: "Logged in.",
    });

    response.cookies.set(COOKIE_NAME, sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });

    return response;
  } catch {
    return NextResponse.json(
      {
        success: false,
        message: "Login failed.",
      },
      { status: 500 }
    );
  }
}