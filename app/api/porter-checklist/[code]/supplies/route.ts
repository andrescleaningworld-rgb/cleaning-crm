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
import { getContentTranslations } from "@/lib/crewTranslations";
import { listCatalogItems, pickedItemIdsForCrew } from "@/lib/pg/crew-supplies";

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

    const [catalog, recentOrders, picked, details] = await Promise.all([
      listSupplyItemsLibrary(true),
      listCrewLinkSupplyOrdersForAccount(link.template.accountId, 10),
      pickedItemIdsForCrew(link.template.accountId),
      // Brand, photo and type for the cards. If they do not load, the cards show name and unit, as before.
      listCatalogItems(false).catch(() => []),
    ]);
    const detailOf = new Map(details.map((item) => [item.id, item]));
    // The items picked for this account (Crew Link setup, "Pick supplies for
    // this account"). Nothing picked, or all of it removed since: every
    // active item, as before.
    const own = picked ? catalog.filter((item) => picked.has(item.id)) : [];
    const items = own.length > 0 ? own : catalog;

    const translations = await getContentTranslations([
      ...items.flatMap((i) => [i.name, i.unit, detailOf.get(i.id)?.category ?? ""]).filter(Boolean),
      ...recentOrders.flatMap((o) => o.lines.map((l) => l.itemName)),
    ]);

    return NextResponse.json({
      success: true,
      translations,
      // Exactly what a crew is sent for an item, and nothing else: no product
      // code, no price or cost, nothing about the account. Brand, photo and
      // type are "" when the item has none.
      items: items.map((i) => {
        const detail = detailOf.get(i.id);
        return { itemId: i.id, name: i.name, unit: i.unit, instanceLabel: null, brand: detail?.brand ?? "", photoUrl: detail?.photoUrl ?? "", type: detail?.category ?? "" };
      }),
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
