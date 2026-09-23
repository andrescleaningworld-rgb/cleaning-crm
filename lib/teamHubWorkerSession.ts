// iron-session config for the crew worker session — the fourth cookie
// alongside adminSession/subSession/portalSession (see docs/team-hub-spec.md
// §9, Phase 1). Binds to crewId + tokenVersion (never the token string
// itself) so regenerateTeamHubCrewToken's token_version bump forces every
// already-logged-in worker on that crew to re-authenticate, matching
// lib/teamHubDb.ts's regenerateTeamHubCrewToken comment.
import { getIronSession, type SessionOptions } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export interface TeamHubWorkerSessionData {
  crewId?: number;
  workerId?: number;
  tokenVersion?: number;
  firstName?: string;
}

export const TEAM_HUB_SESSION_COOKIE = "cw_team_hub_session";

export function teamHubSessionOptions(): SessionOptions {
  const password = process.env.TEAM_HUB_SESSION_PASSWORD;
  if (!password || password.length < 32) {
    throw new Error("TEAM_HUB_SESSION_PASSWORD must be set and at least 32 characters.");
  }
  return {
    cookieName: TEAM_HUB_SESSION_COOKIE,
    password,
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      // A work shift, not a login-once day — same reasoning as sub_session's
      // 8h maxAge (lib/subSession.ts).
      maxAge: 60 * 60 * 8,
    },
  };
}

// Read-only convenience mirroring lib/adminSession.ts's getAdminIdentity —
// route handlers that only need to know who's acting (e.g. to stamp a
// future hub_checklist_runs row) can use this without themselves owning the
// session lifecycle.
export async function getTeamHubWorkerIdentity(request: NextRequest): Promise<TeamHubWorkerSessionData | null> {
  try {
    const response = NextResponse.next();
    const session = await getIronSession<TeamHubWorkerSessionData>(request, response, teamHubSessionOptions());
    if (!session.crewId || !session.workerId) return null;
    return session;
  } catch {
    return null;
  }
}
