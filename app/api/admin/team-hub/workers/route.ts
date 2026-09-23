// Admin-only (proxy.ts default admin gate). Worker CRUD + PIN reset for one
// crew — the hub_workers table was created in Phase 0, this UI ships in
// Phase 1 per docs/team-hub-spec.md §9. Sensitive actions (create, PIN
// reset, deactivate) are audit-logged the same way manager password resets
// are (app/api/admin/manager-accounts/route.ts) — actorRole is always
// "manager"/"owner" here, never "team-hub" (that literal is reserved for
// worker-originated actions once Phase 2+ writes hub_checklist_runs etc.).
import { NextRequest, NextResponse } from "next/server";
import {
  listTeamHubWorkersForCrew,
  createTeamHubWorker,
  renameTeamHubWorker,
  setTeamHubWorkerActive,
  resetTeamHubWorkerPin,
} from "@/lib/teamHubDb";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET(request: NextRequest) {
  try {
    const crewId = Number(new URL(request.url).searchParams.get("crewId"));
    if (!Number.isInteger(crewId)) {
      return NextResponse.json({ success: false, error: "A valid crewId is required." }, { status: 400 });
    }

    const workers = await listTeamHubWorkersForCrew(crewId);
    return NextResponse.json({ success: true, workers });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load workers." },
      { status: 500 }
    );
  }
}

async function logWorkerAction(request: NextRequest, action: "create" | "update", workerId: number | string, detail: string) {
  const actor = await getAdminIdentity(request);
  if (!actor) return;
  await logActivity({
    actorAccountId: actor.accountId ?? null,
    actorRole: actor.role ?? "manager",
    actorName: actor.name || "",
    action,
    entityType: "team-hub-worker",
    entityId: String(workerId),
    detail,
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "");

    if (action === "create") {
      const crewId = Number(body.crewId);
      const firstName = String(body.firstName ?? "").trim();
      const pin = String(body.pin ?? "").trim();

      if (!Number.isInteger(crewId) || !firstName) {
        return NextResponse.json({ success: false, error: "crewId and firstName are required." }, { status: 400 });
      }

      const worker = await createTeamHubWorker({ crewId, firstName, pin });
      await logWorkerAction(request, "create", worker.id, `added "${firstName}"`);
      return NextResponse.json({ success: true, worker });
    }

    const id = Number(body.id);
    if (!Number.isInteger(id)) {
      return NextResponse.json({ success: false, error: "A valid id is required." }, { status: 400 });
    }

    if (action === "rename") {
      const firstName = String(body.firstName ?? "").trim();
      if (!firstName) {
        return NextResponse.json({ success: false, error: "firstName is required." }, { status: 400 });
      }
      const worker = await renameTeamHubWorker(id, firstName);
      if (!worker) return NextResponse.json({ success: false, error: "Worker not found." }, { status: 404 });
      return NextResponse.json({ success: true, worker });
    }

    if (action === "setActive") {
      const active = Boolean(body.active);
      const worker = await setTeamHubWorkerActive(id, active);
      if (!worker) return NextResponse.json({ success: false, error: "Worker not found." }, { status: 404 });
      await logWorkerAction(request, "update", id, active ? "reactivated" : "deactivated");
      return NextResponse.json({ success: true, worker });
    }

    if (action === "resetPin") {
      const pin = String(body.pin ?? "").trim();
      const worker = await resetTeamHubWorkerPin(id, pin);
      if (!worker) return NextResponse.json({ success: false, error: "Worker not found." }, { status: 404 });
      await logWorkerAction(request, "update", id, "PIN reset");
      return NextResponse.json({ success: true, worker });
    }

    return NextResponse.json({ success: false, error: `Unknown action "${action}".` }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to save worker." },
      { status: 500 }
    );
  }
}
