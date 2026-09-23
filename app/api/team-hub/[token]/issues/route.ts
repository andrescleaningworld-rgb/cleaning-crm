// Public route (proxy.ts PUBLIC_PATHS covers "/api/team-hub") — self-checks
// via requireTeamHubWorkerSession, same pattern as the checklist/rounds
// routes. Simplicity pass: the checklist screen's always-visible "Report a
// problem" button. Note only — no photo until Phase 4 (see
// reportTeamHubIssue's comment in lib/teamHubDb.ts).
import { NextRequest, NextResponse } from "next/server";
import { reportTeamHubIssue } from "@/lib/teamHubDb";
import { requireTeamHubWorkerSession } from "@/lib/teamHubWorkerSession";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-issues-post:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const note = String(body.note ?? "");
    if (!note.trim()) {
      return NextResponse.json({ success: false, error: "A note is required." }, { status: 400 });
    }

    const issue = await reportTeamHubIssue({ siteId: ctx.site.id, crewId: ctx.crew.id, workerId: ctx.worker.id, note });
    return NextResponse.json({ success: true, issue });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    const status = message.includes("required") ? 400 : 500;
    if (status === 500) console.error("[team-hub issues POST]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
