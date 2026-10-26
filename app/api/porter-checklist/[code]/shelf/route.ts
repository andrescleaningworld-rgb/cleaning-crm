// Public, no-login route (proxy.ts PUBLIC_PATHS already covers
// "/api/porter-checklist") — Crew Link "📦 Supplies arrived" and "🗑 Case
// empty" (lib/pg/shelves.ts). Gated by the link's porter_code: Supplies
// arrived works on any live link (an order for this site can come from the
// sub portal or the office), Case empty only with its supply-orders switch
// on. Rate-limited per code, like the supplies route. Only
// this link's own account is ever read or changed, and nothing a crew is
// sent carries a product code or a cost.
//
//   GET                                          this site's shelf and what is on its way
//   POST { action: "arrive", key, got, reporterName }   confirm a delivery
//   POST { action: "empty", supplyId, reporterName }    one case used up
import { NextRequest, NextResponse } from "next/server";
import { resolveCrewLink, crewLinkIsLive, cleanReporterName } from "@/lib/crewLink";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { getContentTranslations } from "@/lib/crewTranslations";
import { caseEmpty, confirmArrival, crewShelfView, shelvesReady } from "@/lib/pg/shelves";

type Context = { params: Promise<{ code: string }> };

async function loadEnabled(code: string) {
  const link = await resolveCrewLink(code);
  return link && crewLinkIsLive(link.modules) && (await shelvesReady()) ? link : null;
}

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-shelf-get:${code}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const link = await loadEnabled(code);
    if (!link) return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });
    const full = await crewShelfView(link.template.accountId);
    // The shelf is for Case empty: only with supply orders on here.
    const view = link.modules.supplyOrders ? full : { ...full, shelf: [] };
    const translations = await getContentTranslations([...view.shelf.flatMap((item) => [item.name, item.unit]), ...view.waiting.flatMap((entry) => entry.lines.flatMap((line) => [line.name, line.unit]))].filter(Boolean));
    return NextResponse.json({ success: true, ...view, translations }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[crew-link shelf GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-shelf-post:${code}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const link = await loadEnabled(code);
    if (!link) return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });
    const body = (await request.json().catch(() => ({}))) as { action?: string; key?: string; got?: unknown[]; supplyId?: unknown; reporterName?: string };
    const by = cleanReporterName(body.reporterName);
    if (!by) return NextResponse.json({ success: false, error: "Please enter your name." }, { status: 400 });
    const accountId = link.template.accountId;
    try {
      if (body.action === "arrive") {
        const result = await confirmArrival({ accountId, key: String(body.key ?? ""), got: (Array.isArray(body.got) ? body.got : []).map((n) => Number(n)), by });
        return NextResponse.json({ success: true, short: result.short.length, extra: result.extra.length });
      }
      if (body.action === "empty") {
        if (!link.modules.supplyOrders) return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });
        const result = await caseEmpty({ accountId, supplyId: Number(body.supplyId), by });
        return NextResponse.json({ success: true, qty: result.qty });
      }
    } catch (error) {
      return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "That did not save." }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("[crew-link shelf POST]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}
