import { NextRequest, NextResponse } from "next/server";
import { fetchSmsLogForToDo, updateSmsLogStatus, type SmsLogEntry } from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

const TERMINAL_STATUSES = new Set(["DELIVERED", "FAILED"]);

// Debounce for the live Textbelt check below — this route can be hit once
// per rendered to-do card on every page view, so without this a popular
// to-do list would hammer Textbelt's /status endpoint on every reload. A
// cached SmsLog row (checked within this window) is served as-is instead.
const RECHECK_INTERVAL_MS = 60_000;

// On-demand status check (per GUARDRAILS: option (b), not a background
// poller) — called by the to-do card when it renders. Serves the cached
// SmsLog row unless the latest attempt is non-terminal AND hasn't been
// checked recently, in which case it queries Textbelt's GET /status/:textId
// (public, no key required) and persists the fresh status.
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const toDoId = decodeURIComponent(id);

    const entries = await fetchSmsLogForToDo(toDoId);
    if (entries.length === 0) {
      return NextResponse.json({ hasLog: false });
    }

    const latest = entries[0]; // fetchSmsLogForToDo sorts most-recent-first

    if (!latest.textId || TERMINAL_STATUSES.has(latest.status.toUpperCase())) {
      return NextResponse.json({ hasLog: true, entry: latest });
    }

    const lastCheckedMs = latest.lastCheckedAt ? Date.parse(latest.lastCheckedAt) : 0;
    if (Number.isFinite(lastCheckedMs) && Date.now() - lastCheckedMs < RECHECK_INTERVAL_MS) {
      return NextResponse.json({ hasLog: true, entry: latest });
    }

    const fresh = await checkTextbeltStatus(latest.textId);
    const nowIso = new Date().toISOString();

    if (fresh && fresh !== latest.status) {
      await updateSmsLogStatus(latest.textId, fresh);
    }

    const updated: SmsLogEntry = {
      ...latest,
      status: fresh || latest.status,
      lastCheckedAt: nowIso,
    };

    return NextResponse.json({ hasLog: true, entry: updated });
  } catch (error) {
    return NextResponse.json(
      { hasLog: false, error: error instanceof Error ? error.message : "Failed to check SMS status." },
      { status: 500 }
    );
  }
}

async function checkTextbeltStatus(textId: string): Promise<string | null> {
  try {
    const response = await fetch(`https://textbelt.com/status/${encodeURIComponent(textId)}`);
    const data = (await response.json()) as { status?: string };
    return data.status ?? null;
  } catch (error) {
    console.error("[sms] Textbelt status check failed:", error instanceof Error ? error.message : error);
    return null;
  }
}
