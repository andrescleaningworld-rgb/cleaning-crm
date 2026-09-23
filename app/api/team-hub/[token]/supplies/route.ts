// Public route (proxy.ts PUBLIC_PATHS covers "/api/team-hub") — self-checks
// via requireTeamHubWorkerSession, same pattern as the checklist/rounds/
// issues routes. Phase 4: "Order supplies" — GET the crew's enabled items
// + their recent orders, POST a new order. Responses never carry
// account_id/accountName — only site label (already known client-side) and
// the caller's own order history.
import { NextRequest, NextResponse } from "next/server";
import {
  listEnabledTeamHubSupplyItemsForCrew,
  listRecentTeamHubSupplyOrdersForCrew,
  createTeamHubSupplyOrder,
  setTeamHubSupplyOrderNoteTranslation,
} from "@/lib/teamHubDb";
import { requireTeamHubWorkerSession } from "@/lib/teamHubWorkerSession";
import { lookupAccountSummary } from "@/lib/teamHubAccountLookup";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { sendInternalNotification } from "@/lib/email";
import { translateToEnglish } from "@/lib/translate";
import { waitUntil } from "@vercel/functions";

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-supplies-get:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const [items, recentOrders] = await Promise.all([
      listEnabledTeamHubSupplyItemsForCrew(ctx.crew.id),
      listRecentTeamHubSupplyOrdersForCrew(ctx.crew.id, 10),
    ]);

    return NextResponse.json({
      success: true,
      items: items.map((i) => ({ itemId: i.itemId, name: i.name, unit: i.unit, instanceLabel: i.instanceLabel })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        lines: o.lines.map((l) => ({ itemName: l.itemName, unit: l.unit, qty: l.qty })),
      })),
    });
  } catch (error) {
    console.error("[team-hub supplies GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

// POST { note, lines: [{ itemId, qty }] }
export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const allowed = await checkRateLimit(`teamhub-supplies-post:${token}`);
    if (!allowed) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }

    const ctx = await requireTeamHubWorkerSession(request, token);
    if (!ctx) return NextResponse.json({ success: false, error: "Not signed in." }, { status: 401 });

    const body = (await request.json().catch(() => ({}))) as { note?: string; lines?: { itemId?: number; qty?: number }[] };
    const note = String(body.note ?? "");
    const rawLines = Array.isArray(body.lines) ? body.lines : [];
    const lines = rawLines
      .map((l) => ({ itemId: Number(l?.itemId), qty: Number(l?.qty) }))
      .filter((l) => Number.isInteger(l.itemId) && Number.isInteger(l.qty) && l.qty > 0);

    const order = await createTeamHubSupplyOrder({ siteId: ctx.site.id, crewId: ctx.crew.id, workerId: ctx.worker.id, note, lines });

    const origin = new URL(request.url).origin;

    // SHARED TRANSLATION (docs/team-hub-spec.md §12) — same
    // translate-then-email sequencing as the issues route.
    waitUntil(
      (async () => {
        let englishNote = order.note;
        if (order.note) {
          const translated = await translateToEnglish(order.note);
          if (translated) {
            await setTeamHubSupplyOrderNoteTranslation(order.id, translated.english, translated.detectedLanguage);
            englishNote = translated.english;
          }
        }

        const account = await lookupAccountSummary(ctx.site.accountId);
        const noteLine = order.note ? `Note: ${englishNote}` : "No note.";
        const originalLine = order.note && englishNote !== order.note ? `Original: ${order.note}` : null;

        await sendInternalNotification(`Team Hub: new supply order — ${ctx.site.label}`, [
          `Account: ${account?.accountName ?? ctx.site.accountId}`,
          `Crew: ${ctx.crew.name}`,
          ...order.lines.map((l) => `${l.itemName} x${l.qty} ${l.unit}`),
          noteLine,
          ...(originalLine ? [originalLine] : []),
          `Team Hub tab: ${origin}/accounts/${encodeURIComponent(ctx.site.accountId)}?tab=team-hub`,
        ]);
      })().catch((error) => console.error("[team-hub supplies email]", error))
    );

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    const status = message.includes("at least one item") ? 400 : 500;
    if (status === 500) console.error("[team-hub supplies POST]", error);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
