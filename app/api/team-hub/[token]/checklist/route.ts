// Public route (proxy.ts PUBLIC_PATHS covers "/api/team-hub") — self-checks
// via requireTeamHubWorkerSession on every method, same pattern
// app/api/team-hub/[token]/session/route.ts documents. Phase 2 crew-facing
// checklist run flow: GET loads the crew's enabled items + any open run,
// POST starts or submits a run, PATCH autosaves one item's status/note.
import { NextRequest, NextResponse } from "next/server";
import {
  listDueTeamHubChecklistItemsForCrew,
  getOpenTeamHubChecklistRun,
  startTeamHubChecklistRun,
  listTeamHubChecklistRunItems,
  upsertTeamHubChecklistRunItem,
  submitTeamHubChecklistRun,
} from "@/lib/teamHubDb";
import { requireTeamHubWorkerSession } from "@/lib/teamHubWorkerSession";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-checklist-get:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const items = await listDueTeamHubChecklistItemsForCrew(ctx.crew.id);
    const run = await getOpenTeamHubChecklistRun(ctx.crew.id);
    const runItems = run ? await listTeamHubChecklistRunItems(run.id) : [];

    return NextResponse.json({
      success: true,
      items,
      run: run ? { id: run.id, startedAt: run.startedAt } : null,
      runItems: runItems.map((ri) => ({ crewItemId: ri.crewItemId, status: ri.status, note: ri.note, updatedAt: ri.updatedAt, workerFirstName: ri.workerFirstName })),
    });
  } catch (error) {
    console.error("[team-hub checklist GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

// POST { action: "start" } | { action: "submit" }
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-checklist-post:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { action?: string };

    if (body.action === "start") {
      const run = await startTeamHubChecklistRun(ctx.crew.id, ctx.worker.id);
      return NextResponse.json({ success: true, run: { id: run.id, startedAt: run.startedAt } });
    }

    if (body.action === "submit") {
      const open = await getOpenTeamHubChecklistRun(ctx.crew.id);
      if (!open) {
        return NextResponse.json({ success: false, error: "No checklist is in progress." }, { status: 400 });
      }
      const submitted = await submitTeamHubChecklistRun(ctx.crew.id, open.id);
      return NextResponse.json({ success: true, run: submitted ? { id: submitted.id, submittedAt: submitted.submittedAt } : null });
    }

    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[team-hub checklist POST]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

// PATCH { crewItemId, status, note } — autosaves one item on the crew's
// currently open run. 400s if there is no open run (client should call
// POST {action:"start"} first — the UI always does, this just guards a
// stale/race client).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-checklist-patch:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { crewItemId?: number; status?: string; note?: string };
    const crewItemId = Number(body.crewItemId);
    const status = String(body.status ?? "");
    const note = String(body.note ?? "").slice(0, 2000);

    if (!Number.isInteger(crewItemId) || !["done", "na", "problem"].includes(status)) {
      return NextResponse.json({ success: false, error: "Missing or invalid item/status." }, { status: 400 });
    }

    const open = await getOpenTeamHubChecklistRun(ctx.crew.id);
    if (!open) {
      return NextResponse.json({ success: false, error: "No checklist is in progress." }, { status: 400 });
    }

    const runItem = await upsertTeamHubChecklistRunItem({
      crewId: ctx.crew.id,
      runId: open.id,
      crewItemId,
      workerId: ctx.worker.id,
      status: status as "done" | "na" | "problem",
      note,
    });

    return NextResponse.json({ success: true, item: { crewItemId: runItem.crewItemId, status: runItem.status, note: runItem.note, updatedAt: runItem.updatedAt } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    const status = message.includes("not found") || message.includes("already been submitted") ? 400 : 500;
    if (status === 500) console.error("[team-hub checklist PATCH]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
