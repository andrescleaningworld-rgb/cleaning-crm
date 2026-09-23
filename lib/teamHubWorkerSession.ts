// iron-session config for the crew worker session — the fourth cookie
// alongside adminSession/subSession/portalSession (see docs/team-hub-spec.md
// §9, Phase 1). Binds to crewId + tokenVersion (never the token string
// itself) so regenerateTeamHubCrewToken's token_version bump forces every
// already-logged-in worker on that crew to re-authenticate, matching
// lib/teamHubDb.ts's regenerateTeamHubCrewToken comment.
import { getIronSession, type SessionOptions } from "iron-session";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  getActiveTeamHubCrewByToken,
  getTeamHubWorkerById,
  type TeamHubCrew,
  type TeamHubSite,
  type TeamHubWorker,
} from "@/lib/teamHubDb";

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
      // Simplicity pass (see docs/team-hub-spec.md "GLOBAL RULES"): a
      // non-tech-savvy crew should never have to log in again — "remember
      // me for 90 days," not an 8h shift window like sub_session. Explicit,
      // deliberate change from Phase 1's shift-length reasoning; the
      // session is still fully revocable (regenerateTeamHubCrewToken's
      // token_version bump forces re-auth regardless of maxAge, and an
      // admin deactivating the worker/crew invalidates it on next check).
      maxAge: 60 * 60 * 24 * 90,
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

export type TeamHubWorkerSessionContext = { crew: TeamHubCrew; site: TeamHubSite; worker: TeamHubWorker };

// Full self-check for Phase 2's module routes (checklist, rounds) — same
// checks GET /api/team-hub/[token]/session already does inline (crew+site
// active, session bound to the crew's current token_version, worker still
// active and still on this crew), factored out here so each new module
// route doesn't re-duplicate the logic. Deliberately not retrofitted into
// the existing session route to keep this a Phase 2 addition, not a Phase 1
// diff.
export async function requireTeamHubWorkerSession(request: NextRequest, token: string): Promise<TeamHubWorkerSessionContext | null> {
  const found = await getActiveTeamHubCrewByToken(token);
  if (!found) return null;

  const identity = await getTeamHubWorkerIdentity(request);
  if (!identity || !identity.workerId || identity.crewId !== found.crew.id || identity.tokenVersion !== found.crew.tokenVersion) {
    return null;
  }

  const worker = await getTeamHubWorkerById(identity.workerId);
  if (!worker || !worker.active || worker.crewId !== found.crew.id) return null;

  return { crew: found.crew, site: found.site, worker };
}
