import { NextResponse } from "next/server";

const COOKIE_NAME = "cw_admin_session";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Logged out.",
  });

  response.cookies.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}