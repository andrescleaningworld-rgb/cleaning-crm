// Public, no-login route (proxy.ts PUBLIC_PATHS already covers
// "/api/porter-checklist") — Crew Link "Order supplies"
// (docs/crew-link-spec.md). Gated by the link's porter_code and its
// supply-orders switch; rate-limited per code. Same response shapes as the
// Team Hub supplies route so app/team-hub/[token]/SuppliesView.tsx is reused
// as-is. Never returns account ids or other accounts' data.
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { listSupplyItemsLibrary, createCrewLinkSupplyOrder, listCrewLinkSupplyOrdersForAccount } from "@/lib/teamHubDb";
import { resolveCrewLink, cleanReporterName } from "@/lib/crewLink";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { notifyNewSupplyOrder } from "@/lib/crewNotifications";

async function loadEnabled(code: string) {
  const link = await resolveCrewLink(code);
  return link && link.modules.supplyOrders ? link : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-supplies-get:${code}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const link = await loadEnabled(code);
    if (!link) return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });

    const [items, recentOrders] = await Promise.all([
      listSupplyItemsLibrary(true),
      listCrewLinkSupplyOrdersForAccount(link.template.accountId, 10),
    ]);

    return NextResponse.json({
      success: true,
      items: items.map((i) => ({ itemId: i.id, name: i.name, unit: i.unit, instanceLabel: null })),
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        status: o.status,
        createdAt: o.createdAt,
        lines: o.lines.map((l) => ({ itemName: l.itemName, unit: l.unit, qty: l.qty })),
        otherItems: o.otherItems,
      })),
    });
  } catch (error) {
    console.error("[crew-link supplies GET]", error);
    return NextResponse.json({ success: false, error: "Something went wrong." }, { status: 500 });
  }
}

// POST { reporterName, note, otherItems, lines: [{ itemId, qty }] } — lines may
// be empty when otherItems is filled in (write-in only order).
export async function POST(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    if (!(await checkRateLimit(`crewlink-supplies-post:${code}`))) {
      return NextResponse.json({ success: false, error: "Too many requests. Please wait a minute and try again." }, { status: 429 });
    }
    const link = await loadEnabled(code);
    if (!link) return NextResponse.json({ success: false, error: "Not available." }, { status: 404 });

    const body = (await request.json().catch(() => ({}))) as {
      reporterName?: string;
      note?: string;
      otherItems?: string;
      lines?: { itemId?: number; qty?: number }[];
    };
    const reporterName = cleanReporterName(body.reporterName);
    if (!reporterName) return NextResponse.json({ success: false, error: "Please enter your name." }, { status: 400 });

    const lines = (Array.isArray(body.lines) ? body.lines : [])
      .map((l) => ({ itemId: Number(l?.itemId), qty: Number(l?.qty) }))
      .filter((l) => Number.isInteger(l.itemId) && Number.isInteger(l.qty) && l.qty > 0);

    const order = await createCrewLinkSupplyOrder({
      accountId: link.template.accountId,
      reporterName,
      note: String(body.note ?? ""),
      otherItems: String(body.otherItems ?? ""),
      lines,
    });

    waitUntil(
      notifyNewSupplyOrder({
        source: { kind: "crew-link", reporterName },
        orderId: order.id,
        createdAt: order.createdAt,
        accountId: link.template.accountId,
        note: order.note,
        otherItems: order.otherItems,
        lines: order.lines,
        origin: new URL(request.url).origin,
      }).catch((error) => console.error("[crew-link supplies email]", error))
    );

    return NextResponse.json({ success: true, orderId: order.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Something went wrong.";
    const status = message.includes("at least one item") ? 400 : 500;
    if (status === 500) console.error("[crew-link supplies POST]", error);
    return NextResponse.json({ success: false, error: status === 500 ? "Something went wrong." : message }, { status });
  }
}
