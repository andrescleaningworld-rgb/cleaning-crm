// Public, no-login route — submits a supply order for one site link.
// Response is success/orderId only; never echoes back account/sub data.
import { NextRequest, NextResponse } from "next/server";
import {
  getActiveSiteLinkByToken,
  listSupplyItemsForLink,
  createSupplyOrder,
  type OrderLineInput,
} from "@/lib/siteLinkDb";
import { checkRateLimit } from "@/lib/siteLinkRateLimit";
import { notifyNewSupplyOrder } from "@/lib/siteLinkNotify";
import { logActivity } from "@/lib/activityLog";

const MAX_NOTE_LENGTH = 1000;
const MAX_QTY_PER_LINE = 999;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const link = await getActiveSiteLinkByToken(token);
    if (!link) {
      return NextResponse.json({ success: false, error: "Link not active." }, { status: 404 });
    }

    const allowed = await checkRateLimit(`order:${token}`);
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: "Too many requests — please wait a moment and try again." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const note = String(body.note ?? "").trim().slice(0, MAX_NOTE_LENGTH);
    const rawLines = Array.isArray(body.lines) ? body.lines : [];

    if (rawLines.length === 0) {
      return NextResponse.json(
        { success: false, error: "Add at least one item before submitting." },
        { status: 400 }
      );
    }

    // Validate every line's itemId against THIS link's own allowed-item
    // list (not the global catalog) — a caller can't order an item that
    // isn't offered to this specific site, even by crafting the request
    // body directly.
    const allowedItems = await listSupplyItemsForLink(link.id);
    const allowedIds = new Set(allowedItems.map((i) => i.id));

    const lines: OrderLineInput[] = [];
    for (const raw of rawLines) {
      const itemId = Number(raw?.itemId);
      const qty = Number(raw?.qty);
      if (!Number.isInteger(itemId) || !allowedIds.has(itemId)) continue;
      if (!Number.isInteger(qty) || qty <= 0) continue;
      lines.push({ itemId, qty: Math.min(qty, MAX_QTY_PER_LINE) });
    }

    if (lines.length === 0) {
      return NextResponse.json(
        { success: false, error: "None of the submitted items are valid for this link." },
        { status: 400 }
      );
    }

    const orderId = await createSupplyOrder({ linkId: link.id, note, lines });

    const lineDetails = lines.map((line) => {
      const item = allowedItems.find((i) => i.id === line.itemId)!;
      return { itemName: item.name, unit: item.unit, qty: line.qty };
    });

    const origin = new URL(request.url).origin;
    await notifyNewSupplyOrder({
      origin,
      accountId: link.accountId,
      linkLabel: link.label,
      orderId,
      note,
      lines: lineDetails,
    });

    await logActivity({
      actorAccountId: null,
      actorRole: "site-link",
      actorName: link.label,
      action: "create",
      entityType: "supply_order",
      entityId: String(orderId),
    });

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    console.error("[site-link order POST]", error);
    return NextResponse.json(
      { success: false, error: "Something went wrong submitting this order." },
      { status: 500 }
    );
  }
}
