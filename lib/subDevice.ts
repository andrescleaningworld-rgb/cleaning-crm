// "This phone belongs to this sub", for PIN login. A sealed cookie that
// lasts 90 days and holds only the sub's email and first name. It does not
// log anyone in by itself: it only says whose PIN to ask for.

import { getIronSession, type SessionOptions } from "iron-session";
import type { NextRequest, NextResponse } from "next/server";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";

export type SubDeviceData = { email?: string; firstName?: string };

export const SUB_DEVICE_COOKIE = "sub_device";

export function subDeviceOptions(): SessionOptions {
  // Same secret as the sub session; a different cookie name keeps the two apart.
  const base = subSessionOptions();
  return {
    cookieName: SUB_DEVICE_COOKIE,
    password: base.password,
    cookieOptions: { ...base.cookieOptions, maxAge: 60 * 60 * 24 * 90 },
  };
}

export function readSubDevice(request: NextRequest, response: NextResponse) {
  return getIronSession<SubDeviceData>(request, response, subDeviceOptions());
}

export function readSubSession(request: NextRequest, response: NextResponse) {
  return getIronSession<SubSessionData>(request, response, subSessionOptions());
}

export function firstNameOf(name: string): string {
  return String(name ?? "").trim().split(/\s+/)[0] ?? "";
}
