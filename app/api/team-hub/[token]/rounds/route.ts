// Public route (proxy.ts PUBLIC_PATHS covers "/api/team-hub") — self-checks
// via requireTeamHubWorkerSession, same pattern as .../checklist/route.ts.
// Rounds have no "run" concept (see lib/teamHubDb.ts comment above
// getLatestTeamHubRoundChecksForCrew) — GET returns each enabled round with
// its most recent check-in, POST records a new one.
import { getContentTranslations } from "@/lib/crewTranslations";
import { NextRequest, NextResponse } from "next/server";
import { listEnabledTeamHubRoundItemsForCrew, getLatestTeamHubRoundChecksForCrew, recordTeamHubRoundCheck } from "@/lib/teamHubDb";
import { requireTeamHubWorkerSession } from "@/lib/teamHubWorkerSession";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-rounds-get:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const items = await listEnabledTeamHubRoundItemsForCrew(ctx.crew.id);
    const latest = await getLatestTeamHubRoundChecksForCrew(ctx.crew.id);

    const translations = await getContentTranslations(items.flatMap((i) => [i.name, i.instanceLabel ?? ""]));

    return NextResponse.json({
      success: true,
      translations,
      items: items.map((item) => ({
        ...item,
        lastCheck: latest.get(item.crewItemId)
          ? {
              checkedAt: latest.get(item.crewItemId)!.checkedAt,
              note: latest.get(item.crewItemId)!.note,
              workerFirstName: latest.get(item.crewItemId)!.workerFirstName,
            }
          : null,
      })),
    });
  } catch (error) {
    console.error("[team-hub rounds GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

// POST { crewItemId, note } — records a check-in for the current worker.
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-rounds-post:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { crewItemId?: number; note?: string };
    const crewItemId = Number(body.crewItemId);
    const note = String(body.note ?? "").slice(0, 2000);
    if (!Number.isInteger(crewItemId)) {
      return NextResponse.json({ success: false, error: "Missing round." }, { status: 400 });
    }

    const check = await recordTeamHubRoundCheck({ crewId: ctx.crew.id, crewItemId, workerId: ctx.worker.id, note });
    return NextResponse.json({
      success: true,
      lastCheck: { checkedAt: check.checkedAt, note: check.note, workerFirstName: ctx.worker.firstName },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    const status = message.includes("not found") ? 400 : 500;
    if (status === 500) console.error("[team-hub rounds POST]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
