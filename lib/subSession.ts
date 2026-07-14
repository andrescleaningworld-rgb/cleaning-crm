import type { SessionOptions } from "iron-session";

export interface SubSessionData {
  subcontractorId?: string;
  subcontractorEmail?: string;
  subcontractorName?: string;
}

export const SUB_SESSION_COOKIE = "sub_session";

export function subSessionOptions(): SessionOptions {
  const password = process.env.SUB_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("SUB_SESSION_PASSWORD must be set and at least 32 characters.");
  }
  return {
    cookieName: SUB_SESSION_COOKIE,
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 8,
    },
  };
}
