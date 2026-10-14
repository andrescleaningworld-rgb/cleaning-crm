// Public, no-login route (proxy.ts PUBLIC_PATHS already covers
// "/api/porter-checklist") — Crew Link "📦 Supplies arrived" and "🗑 Case
// empty" (lib/pg/shelves.ts). Gated by the link's porter_code and its
// supply-orders switch; rate-limited per code, like the supplies route. Only
// this link's own account is ever read or changed, and nothing a crew is
// sent carries a product code or a cost.
//
//   GET                                          this site's shelf and what is on its way
//   POST { action: "arrive", key, got, reporterName }   confirm a delivery
//   POST { action: "empty", supplyId, reporterName }    one case used up
import { NextRequest, NextResponse } from "next/server";
import { resolveCrewLink, cleanReporterName } from "@/lib/crewLink";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { getContentTranslations } from "@/lib/crewTranslations";
import { caseEmpty, confirmArrival, crewShelfView } from "@/lib/pg/shelves";
import { oneListReady } from "@/lib/pg/supply-list";

type Context = { params: Promise<{ code: string }> };

async function loadEnabled(code: string) {
  const link = await resolveCrewLink(code);
  return link && link.modules.supplyOrders && (await oneListReady()) ? link : null;
}

export async function GET(_request: NextRequest, { params }: Context) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-shelf-get:${code}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const link = await loadEnabled(code);
    if (!link) return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });
    const view = await crewShelfView(link.template.accountId);
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
        return NextResponse.json({ success: true, short: result.short.length });
      }
      if (body.action === "empty") {
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
