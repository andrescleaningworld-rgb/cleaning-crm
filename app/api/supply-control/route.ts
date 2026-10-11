// Supply control for staff: the shelf, the red Reorder list, orders by step,
// this month's spend per site, and the settings. Staff only (proxy.ts
// default gate). Behind FEATURE_SUPPLY_CONTROL; when it is off, or this
// database has not had its update, GET answers { ready: false } and the
// screens keep working exactly as before.

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAdminIdentity } from "@/lib/adminSession";
import {
  advanceOrderLine,
  createControlledOrder,
  getAccountSupplyMode,
  getSupplySettings,
  listMoves,
  listOrderLines,
  listShelf,
  markInvoiced,
  monthSpend,
  moveFromShelf,
  reorderItem,
  saveShelfItem,
  saveSupplySettings,
  setAccountSupplyMode,
  supplyControlReady,
} from "@/lib/pg/supply-control";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  try {
    if (!(await supplyControlReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const identity = await getAdminIdentity(request);
    const view = request.nextUrl.searchParams.get("view") ?? "";

    // One account's "Supplies included / billed to customer".
    if (view === "account") {
      const accountId = clean(request.nextUrl.searchParams.get("accountId"));
      return NextResponse.json({ success: true, ready: true, mode: accountId ? await getAccountSupplyMode(accountId) : "included" }, noStore);
    }

    // The item list only: for the 3-tap order sheet.
    if (view === "items") return NextResponse.json({ success: true, ready: true, shelf: await listShelf() }, noStore);

    const month = clean(request.nextUrl.searchParams.get("month"));
    const [shelf, orders, spend, settings, moves] = await Promise.all([listShelf(), listOrderLines(), monthSpend(month), getSupplySettings(), listMoves(40)]);
    return NextResponse.json(
      { success: true, ready: true, shelf, reorder: shelf.filter((item) => item.low), orders, spend, settings, moves, isOwner: identity?.role === "owner", me: identity?.name ?? "" },
      noStore
    );
  } catch (error) {
    console.error("[supply-control GET]", error instanceof Error ? error.message : error);
    return refuse("Supplies did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await supplyControlReady())) return refuse("Supply control is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = identity.name ?? "";

    // A photo of an item: multipart, not JSON.
    if ((request.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return refuse("File storage is not set up here, so the photo cannot be saved.", 500);
      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      const id = Number(form?.get("id"));
      if (!(file instanceof File) || !Number.isInteger(id)) return refuse("Choose a photo.");
      if (file.size > MAX_PHOTO_BYTES) return refuse("The photo must be 8MB or smaller.");
      if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return refuse("Use a photo (JPG or PNG).");
      const extension = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")).toLowerCase() : ".jpg";
      const blob = await put(`supplies/${crypto.randomUUID()}${extension}`, file, { access: "public", contentType: file.type || "image/jpeg", addRandomSuffix: false });
      const shelf = await listShelf();
      const item = shelf.find((entry) => entry.id === id);
      if (!item) return refuse("That item was not found.", 404);
      await saveShelfItem(id, { photoUrl: blob.url, unitCost: item.unitCost ?? "", vendor: item.vendor, shelfLocation: item.shelfLocation, minLevel: item.minLevel ?? "" }, by);
      return NextResponse.json({ success: true, photoUrl: blob.url });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "saveItem") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return refuse("That item was not found.");
      await saveShelfItem(id, body, by);
      return NextResponse.json({ success: true });
    }

    // A manager orders for a site (an order that came by text or call), or the office does.
    if (action === "order") {
      const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => {
        const entry = (line ?? {}) as Record<string, unknown>;
        return { supplyId: Number(entry.supplyId), qty: Number(entry.qty), source: entry.source === "buy" ? ("buy" as const) : ("shelf" as const) };
      });
      const made = await createControlledOrder({ accountId: clean(body.accountId), accountName: clean(body.accountName), lines, orderedBy: by, notes: clean(body.notes) });
      return NextResponse.json({ success: true, ...made });
    }

    if (action === "advance") {
      const toStep = clean(body.step);
      // Approving is the office's (owner's) call; the other steps are whoever does the work.
      if (toStep === "approved" && identity.role !== "owner") return refuse("Only the owner can approve an order.", 403);
      const line = await advanceOrderLine(Number(body.rowNumber), toStep, by);
      return NextResponse.json({ success: true, line });
    }

    if (action === "reorder") {
      const made = await reorderItem(Number(body.id), by);
      return NextResponse.json({ success: true, ...made });
    }

    // The office takes or returns items without the tablet (rare; the tablet is the normal way).
    if (action === "take" || action === "return") {
      const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => ({ supplyId: Number((line as Record<string, unknown>)?.supplyId), qty: Number((line as Record<string, unknown>)?.qty) }));
      const moved = await moveFromShelf({ kind: action, lines, accountId: clean(body.accountId), accountName: clean(body.accountName), staffId: clean(identity.staffId), staffName: by });
      return NextResponse.json({ success: true, ...moved });
    }

    if (action === "setMode") {
      const mode = body.mode === "billed" ? "billed" : "included";
      await setAccountSupplyMode(clean(body.accountId), clean(body.accountName), mode, by);
      return NextResponse.json({ success: true, mode });
    }

    if (action === "markInvoiced") {
      await markInvoiced(clean(body.accountId), clean(body.month), Number(body.amount) || 0, body.on !== false, by);
      return NextResponse.json({ success: true });
    }

    if (action === "saveSettings") {
      if (identity.role !== "owner") return refuse("Only the owner can change this.", 403);
      return NextResponse.json({ success: true, settings: await saveSupplySettings(body.autoApproveAmount, by) });
    }

    return refuse("Unknown action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[supply-control POST]", message);
    // The plain-words messages thrown by lib/pg/supply-control.ts are safe to show.
    return refuse(message && message.length < 120 && !/sql|syntax|relation|column/i.test(message) ? message : "That did not save. Try again.", 400);
  }
}
