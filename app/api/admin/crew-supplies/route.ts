// Staff only (proxy.ts default gate). Crew Link supplies: the catalog, the
// list picked for one account, and editing an order a crew already sent.
// See lib/pg/crew-supplies.ts. Until migration 033 is in this database every
// GET answers { ready: false } and the screens hide the feature.

import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";
import { scheduleCrewTranslations } from "@/lib/crewTranslations";
import {
  catalogTypesReady,
  crewSuppliesReady,
  defaultListReady,
  editCrewOrder,
  editMarksFor,
  getAccountSupplyIds,
  getCrewOrderDetail,
  listAccountsWithLists,
  listCatalogItems,
  listCrewLinkOrders,
  saveCatalogItem,
  setAccountSupplyIds,
  setCatalogItemActive,
  setCatalogItemDefault,
} from "@/lib/pg/crew-supplies";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };
const MAX_PHOTO_BYTES = 8 * 1024 * 1024;

export async function GET(request: NextRequest) {
  try {
    if (!(await crewSuppliesReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const params = request.nextUrl.searchParams;
    const view = params.get("view");

    // Supplies page -> Catalog: every item, the removed ones too.
    if (view === "catalog") {
      // typesOn: the catalog has a type and a product code for each item (migration 035).
      // defaultOn: the catalog has its default list (migration 036).
      const [items, typesOn, defaultOn] = await Promise.all([listCatalogItems(true), catalogTypesReady(), defaultListReady()]);
      return NextResponse.json({ success: true, ready: true, items, typesOn, defaultOn }, noStore);
    }

    // Crew Link setup -> "Pick supplies for this account".
    if (view === "account") {
      const accountId = clean(params.get("accountId"));
      if (!accountId) return refuse("accountId is required.");
      const [items, pickedIds, others] = await Promise.all([listCatalogItems(false), getAccountSupplyIds(accountId), listAccountsWithLists()]);
      return NextResponse.json({ success: true, ready: true, items, pickedIds, others: others.filter((other) => other.accountId !== accountId) }, noStore);
    }

    // "Copy list from another account": that account's picks.
    if (view === "accountList") {
      const accountId = clean(params.get("accountId"));
      if (!accountId) return refuse("accountId is required.");
      return NextResponse.json({ success: true, ready: true, pickedIds: await getAccountSupplyIds(accountId) }, noStore);
    }

    // Supply Orders page -> "Crew Link orders".
    if (view === "orders") {
      return NextResponse.json({ success: true, ready: true, orders: await listCrewLinkOrders() }, noStore);
    }

    // "Edit order": one order, what the crew first sent, and what can be added.
    if (view === "order") {
      const id = Number(params.get("id"));
      const order = Number.isInteger(id) ? await getCrewOrderDetail(id) : null;
      if (!order) return refuse("That order was not found.", 404);
      return NextResponse.json({ success: true, ready: true, order }, noStore);
    }

    // "Edited by ..." under orders listed elsewhere (the Accounts Center queue, the account's own list).
    if (view === "marks") {
      const ids = clean(params.get("ids"))
        .split(",")
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id))
        .slice(0, 300);
      return NextResponse.json({ success: true, ready: true, marks: await editMarksFor(ids) }, noStore);
    }

    return refuse("Unknown view.");
  } catch (error) {
    console.error("[crew-supplies GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await crewSuppliesReady())) return refuse("This is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";

    // A photo of a catalog item: multipart, not JSON. It answers with the address; saving the item keeps it.
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return refuse("File storage is not set up here, so the photo cannot be saved.", 500);
      const form = await request.formData().catch(() => null);
      const file = form?.get("file");
      if (!(file instanceof File)) return refuse("Choose a photo.");
      if (file.size > MAX_PHOTO_BYTES) return refuse("The photo must be 8MB or smaller.");
      if (!/^image\//i.test(file.type) && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) return refuse("Use a photo (JPG or PNG).");
      const extension = /\.(jpe?g|png|webp|heic|heif)$/i.exec(file.name)?.[0].toLowerCase() ?? ".jpg";
      const blob = await put(`supply-catalog/${crypto.randomUUID()}${extension}`, file, { access: "public", contentType: file.type || "image/jpeg", addRandomSuffix: false });
      return NextResponse.json({ success: true, photoUrl: blob.url });
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "saveItem") {
      const id = body.id === undefined || body.id === null || body.id === "" ? undefined : Number(body.id);
      if (id !== undefined && !Number.isInteger(id)) return refuse("That item was not found.", 404);
      if (!clean(body.name)) return refuse("Write the item's name.");
      const item = await saveCatalogItem(
        { id, name: clean(body.name), brand: clean(body.brand), productLine: clean(body.productLine), unit: clean(body.unit), photoUrl: clean(body.photoUrl), category: clean(body.category), sku: clean(body.sku) },
        by
      );
      if (!item) return refuse("That item was not found.", 404);
      // The crews read item names in Spanish and Portuguese too.
      scheduleCrewTranslations();
      return NextResponse.json({ success: true, item });
    }

    if (action === "setActive") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || !(await setCatalogItemActive(id, body.active === true, by))) return refuse("That item was not found.", 404);
      return NextResponse.json({ success: true });
    }

    // On or off the default list: what a crew at an account with no list of its own can order.
    if (action === "setDefault") {
      const id = Number(body.id);
      if (!Number.isInteger(id) || !(await setCatalogItemDefault(id, body.on === true, by))) return refuse("That item was not found.", 404);
      return NextResponse.json({ success: true });
    }

    if (action === "setAccountList") {
      const accountId = clean(body.accountId);
      if (!accountId) return refuse("accountId is required.");
      const ids = (Array.isArray(body.itemIds) ? body.itemIds : []).map((id) => Number(id)).filter((id) => Number.isInteger(id));
      return NextResponse.json({ success: true, pickedIds: await setAccountSupplyIds(accountId, ids, by) });
    }

    if (action === "editOrder") {
      const id = Number(body.id);
      if (!Number.isInteger(id)) return refuse("That order was not found.", 404);
      const lines = (Array.isArray(body.lines) ? body.lines : []).map((line) => ({ itemId: Number((line as { itemId?: unknown })?.itemId), qty: Number((line as { qty?: unknown })?.qty) }));
      let changes: string[];
      try {
        changes = await editCrewOrder(id, { lines, otherItems: clean(body.otherItems) }, by);
      } catch (error) {
        return refuse(error instanceof Error ? error.message : "The order was not changed.");
      }
      if (changes.length > 0 && identity.accountId) {
        await logActivity({
          actorAccountId: identity.accountId,
          actorRole: identity.role ?? "manager",
          actorName: identity.name || "",
          action: "update",
          entityType: "team-hub-supply-order",
          entityId: String(id),
          detail: `edited: ${changes.join("; ")}`.slice(0, 500),
        }).catch((error) => console.error("[crew-supplies] activity log:", error instanceof Error ? error.message : error));
      }
      return NextResponse.json({ success: true, changes });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[crew-supplies POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
