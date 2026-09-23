// iron-session cookie for the Equipment Check tablet app
// (docs/equipment-check-spec.md). Shared tablets, nobody stays signed in:
// the page signs out after "Done!" and after 2 minutes with no taps, and
// this cookie is a short server-side backstop on top of that (15 minutes,
// refreshed on every signed-in request) so an abandoned tablet can't hold a
// session open. Bound to the link's key_version, so "New link" in Equipment
// signs everyone out at once.
//
// Reuses TEAM_HUB_SESSION_PASSWORD (no new env var to provision) under its
// own cookie name — a Team Hub cookie can never be read as this one, and
// the staffId inside is re-checked against the live Staff tab every time.
import { getIronSession, type SessionOptions } from "iron-session";
import { NextResponse, type NextRequest } from "next/server";
import { checkEquipmentCheckLinkKey } from "@/lib/equipmentCheckDb";
import { getStaffById } from "@/lib/googleSheets";
import type { Staff } from "@/app/equipment/types";

export interface EquipmentCheckSessionData {
  staffId?: string;
  keyVersion?: number;
}

export const EQUIPMENT_CHECK_SESSION_COOKIE = "cw_equipment_check_session";
const SESSION_MAX_AGE_SECONDS = 15 * 60;

export function equipmentCheckSessionOptions(): SessionOptions {
  const password = process.env.TEAM_HUB_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("TEAM_HUB_SESSION_PASSWORD must be set and at least 32 characters.");
  }
  return {
    cookieName: EQUIPMENT_CHECK_SESSION_COOKIE,
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    },
  };
}

export async function startEquipmentCheckSession(
  request: NextRequest,
  response: NextResponse,
  staffId: string,
  keyVersion: number
): Promise<void> {
  const session = await getIronSession<EquipmentCheckSessionData>(request, response, equipmentCheckSessionOptions());
  session.staffId = staffId;
  session.keyVersion = keyVersion;
  await session.save();
}

export async function endEquipmentCheckSession(request: NextRequest, response: NextResponse): Promise<void> {
  const session = await getIronSession<EquipmentCheckSessionData>(request, response, equipmentCheckSessionOptions());
  session.destroy();
}

// Full check for every signed-in route: link key valid, session made under
// the current key_version, and the person still Active in the Staff tab.
// Read-only (a throwaway response, like lib/teamHubWorkerSession.ts) —
// callers roll the expiry forward by calling startEquipmentCheckSession on
// the response they actually send.
export async function requireEquipmentCheckSession(
  request: NextRequest,
  key: string
): Promise<{ staff: Staff; keyVersion: number } | null> {
  const link = await checkEquipmentCheckLinkKey(key);
  if (!link) return null;

  let session;
  try {
    session = await getIronSession<EquipmentCheckSessionData>(request, NextResponse.next(), equipmentCheckSessionOptions());
  } catch {
    return null;
  }
  if (!session.staffId || session.keyVersion !== link.keyVersion) return null;

  const staff = await getStaffById(session.staffId);
  if (!staff || !staff.active) return null;

  return { staff, keyVersion: link.keyVersion };
}
