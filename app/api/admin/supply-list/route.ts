// Staff only (proxy.ts default gate). One supply list (lib/pg/supply-list.ts):
//
//   GET  view=picker&accountId    Crew Link setup -> "Pick supplies for this
//                                 account": the products, what is picked, and
//                                 other accounts' lists to copy from
//   GET  view=accountList&accountId   another account's picks (product ids)
//   GET  view=product&rowNumber   one product's Crew Link fields (Supplies -> Edit)
//   POST setPicks { accountId, supplyIds }
//   POST saveCrew { rowNumber, crewName, brand, inDefaultList }
//
// Until migration 038 is in this database every GET answers { ready: false }.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { scheduleCrewTranslations } from "@/lib/crewTranslations";
import { listAccountsWithLists } from "@/lib/pg/crew-supplies";
import { getAccountPicks, listProducts, oneListReady, saveCrewFields, setAccountPicks, type Product } from "@/lib/pg/supply-list";
import { getSql } from "@/lib/db";

const clean = (value: unknown) => String(value ?? "").trim();
const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });
const noStore = { headers: { "Cache-Control": "no-store" } };

/** What the picker shows of a product. The product code is staff side only, as before. */
const forPicker = (product: Product) => ({
  supplyId: product.id,
  name: product.crewName,
  brand: product.brand,
  type: product.category,
  code: product.code,
  unit: product.unit,
  photoUrl: product.photoUrl,
  onDefault: product.inDefaultList,
});

async function productIdOfRow(rowNumber: number): Promise<number | null> {
  const rows = (await getSql()`SELECT id FROM sub_supplies WHERE sheet_row = ${rowNumber}`) as { id: string | number }[];
  return rows[0] ? Number(rows[0].id) : null;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await oneListReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const params = request.nextUrl.searchParams;
    const view = params.get("view");

    if (view === "picker") {
      const accountId = clean(params.get("accountId"));
      if (!accountId) return refuse("accountId is required.");
      const [products, pickedIds, others] = await Promise.all([listProducts(false), getAccountPicks(accountId), listAccountsWithLists()]);
      return NextResponse.json(
        { success: true, ready: true, products: products.map(forPicker), pickedIds, others: others.filter((other) => other.accountId !== accountId) },
        noStore
      );
    }

    if (view === "accountList") {
      const accountId = clean(params.get("accountId"));
      if (!accountId) return refuse("accountId is required.");
      return NextResponse.json({ success: true, ready: true, pickedIds: await getAccountPicks(accountId) }, noStore);
    }

    if (view === "product") {
      const rowNumber = Number(params.get("rowNumber"));
      const id = Number.isInteger(rowNumber) ? await productIdOfRow(rowNumber) : null;
      const product = id === null ? null : (await listProducts(true)).find((entry) => entry.id === id);
      if (!product) return refuse("That product was not found.", 404);
      return NextResponse.json({ success: true, ready: true, product: { crewName: product.crewName, brand: product.brand, inDefaultList: product.inDefaultList } }, noStore);
    }

    return refuse("Unknown view.");
  } catch (error) {
    console.error("[supply-list GET]", error instanceof Error ? error.message : error);
    return refuse("That did not load.", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!(await oneListReady())) return refuse("This is not turned on here yet.", 409);
    const identity = await getAdminIdentity(request);
    if (!identity) return refuse("Log in first.", 401);
    const by = clean(identity.name) || "Staff";
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const action = clean(body.action);

    if (action === "setPicks") {
      const accountId = clean(body.accountId);
      if (!accountId) return refuse("accountId is required.");
      const ids = (Array.isArray(body.supplyIds) ? body.supplyIds : []).map((id) => Number(id)).filter((id) => Number.isInteger(id));
      const pickedIds = await setAccountPicks(accountId, ids, by);
      // New crew items: their names in Spanish and Portuguese for the crews.
      scheduleCrewTranslations();
      return NextResponse.json({ success: true, pickedIds });
    }

    if (action === "saveCrew") {
      const rowNumber = Number(body.rowNumber);
      const id = Number.isInteger(rowNumber) ? await productIdOfRow(rowNumber) : null;
      if (id === null) return refuse("That product was not found.", 404);
      try {
        await saveCrewFields(id, { crewName: clean(body.crewName), brand: clean(body.brand), inDefaultList: body.inDefaultList === true }, by);
      } catch (error) {
        return refuse(error instanceof Error ? error.message : "That did not save.");
      }
      scheduleCrewTranslations();
      return NextResponse.json({ success: true });
    }

    return refuse("Unknown action.");
  } catch (error) {
    console.error("[supply-list POST]", error instanceof Error ? error.message : error);
    return refuse("That did not save. Try again.", 500);
  }
}
