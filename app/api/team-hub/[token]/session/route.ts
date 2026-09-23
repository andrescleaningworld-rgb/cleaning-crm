// Public route (proxy.ts PUBLIC_PATHS covers "/api/team-hub") — but every
// method here self-checks: GET/DELETE read the worker session cookie
// itself (same self-checking pattern /api/subcontractor-portal uses for its
// login action), and POST is the one action that doesn't require a session
// yet, since it's what creates one.
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import {
  getActiveTeamHubCrewByToken,
  getTeamHubCrewModules,
  getTeamHubWorkerById,
  verifyTeamHubWorkerPin,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/teamHubDb";
import { teamHubSessionOptions, type TeamHubWorkerSessionData } from "@/lib/teamHubWorkerSession";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { waitUntil } from "@vercel/functions";
import { sendInternalNotification } from "@/lib/email";

async function loadModules(crewId: number) {
  const modules = await getTeamHubCrewModules(crewId);
  return Object.entries(modules)
    .filter(([, enabled]) => enabled)
    .map(([moduleName]) => moduleName);
}

// GET /api/team-hub/[token]/session — "whoami" for a returning worker. Every
// check (crew still active, token still current version, worker still
// active) has to hold or the session reads as logged-out — this is what
// makes regenerateTeamHubCrewToken's token_version bump (lib/teamHubDb.ts)
// actually force re-authentication instead of just breaking the old URL.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const allowed = await checkRateLimit(`teamhub-whoami:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const found = await getActiveTeamHubCrewByToken(token);
    if (!found) {
      return NextResponse.json({ success: true, authenticated: false });
    }

    // Throwaway response for the read — plain field reads never write a
    // Set-Cookie header (only session.save()/destroy() do), so this mirrors
    // lib/adminSession.ts's getAdminIdentity for the read path.
    const probeResponse = NextResponse.next();
    const session = await getIronSession<TeamHubWorkerSessionData>(request, probeResponse, teamHubSessionOptions());

    if (
      !session.crewId ||
      !session.workerId ||
      session.crewId !== found.crew.id ||
      session.tokenVersion !== found.crew.tokenVersion
    ) {
      return NextResponse.json({ success: true, authenticated: false });
    }

    const worker = await getTeamHubWorkerById(session.workerId);
    if (!worker || !worker.active || worker.crewId !== found.crew.id) {
      // Unlike the read above, destroy() DOES need to land on the response
      // actually sent back (to clear the stale cookie), so this rebinds to
      // a real response instead of the throwaway one.
      const clearResponse = NextResponse.json({ success: true, authenticated: false });
      const clearSession = await getIronSession<TeamHubWorkerSessionData>(request, clearResponse, teamHubSessionOptions());
      clearSession.destroy();
      return clearResponse;
    }

    return NextResponse.json({
      success: true,
      authenticated: true,
      worker: { id: worker.id, firstName: worker.firstName },
      crewName: found.crew.name,
      siteLabel: found.site.label,
      modules: await loadModules(found.crew.id),
    });
  } catch (error) {
    console.error("[team-hub session GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

// POST /api/team-hub/[token]/session — PIN login. Body: { workerId, pin }.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const allowed = await checkRateLimit(`teamhub-login:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many attempts. Please wait a minute and try again." }, { status: 429 });
    }

    const found = await getActiveTeamHubCrewByToken(token);
    if (!found) {
      return NextResponse.json({ success: false, error: "This link is no longer active." }, { status: 404 });
    }

    const body = (await request.json()) as { workerId?: number; pin?: string };
    const workerId = Number(body.workerId);
    const pin = String(body.pin ?? "");
    if (!Number.isInteger(workerId) || !pin) {
      return NextResponse.json({ success: false, error: "Choose your name and enter your PIN." }, { status: 400 });
    }

    const device = request.headers.get("user-agent")?.slice(0, 255) ?? null;
    const result = await verifyTeamHubWorkerPin(found.crew.id, workerId, pin, device);

    if (result.outcome === "not-found") {
      return NextResponse.json({ success: false, error: "Worker not found." }, { status: 404 });
    }
    if (result.outcome === "locked") {
      if (result.justLocked) {
        // Fire-and-forget — waitUntil keeps this running after the response
        // is sent without making the crew's login wait on email delivery
        // (same reasoning docs/team-hub-spec.md §6 flagged for the archived
        // Site Supply Link's order/issue notifications). sendInternalNotification
        // already no-ops safely if EMAIL_PROVIDER credentials aren't set.
        waitUntil(
          sendInternalNotification(`Team Hub: ${result.worker.firstName} locked out`, [
            `Worker "${result.worker.firstName}" was locked out of the ${found.crew.name} crew link`,
            `after ${MAX_FAILED_ATTEMPTS} incorrect PIN attempts.`,
            `Site: ${found.site.label}`,
            `Locked until: ${result.lockedUntil}`,
          ]).catch((error) => console.error("[team-hub lockout alert]", error))
        );
      }
      return NextResponse.json(
        { success: false, error: "Too many incorrect PINs. Locked for a few minutes.", lockedUntil: result.lockedUntil },
        { status: 423 }
      );
    }
    if (result.outcome === "invalid") {
      return NextResponse.json({ success: false, error: "Incorrect PIN." }, { status: 401 });
    }

    const finalResponse = NextResponse.json({
      success: true,
      worker: { id: result.worker.id, firstName: result.worker.firstName },
      crewName: found.crew.name,
      siteLabel: found.site.label,
      modules: await loadModules(found.crew.id),
    });
    const session = await getIronSession<TeamHubWorkerSessionData>(request, finalResponse, teamHubSessionOptions());
    session.crewId = found.crew.id;
    session.workerId = result.worker.id;
    session.tokenVersion = found.crew.tokenVersion;
    session.firstName = result.worker.firstName;
    await session.save();

    return finalResponse;
  } catch (error) {
    console.error("[team-hub session POST]", error);
    return NextResponse.json({ success: false, error: "Login failed." }, { status: 500 });
  }
}

// DELETE /api/team-hub/[token]/session — logout.
export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true });
  try {
    const session = await getIronSession<TeamHubWorkerSessionData>(request, response, teamHubSessionOptions());
    session.destroy();
  } catch {
    // ignore — TEAM_HUB_SESSION_PASSWORD missing or cookie unreadable; still
    // logs out cleanly since the client discards its local state regardless.
  }
  return response;
}
