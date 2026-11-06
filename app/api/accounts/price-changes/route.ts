// "Price & frequency change" (migration 072). Staff only (proxy.ts default
// gate; the staff sign-in gives the name saved with the change).
//
// GET  ?accountId=ACC-1        { ready, changes } for the account page's Change history
// GET  ?from=YYYY-MM-DD&to=…   { ready, changes } effective in that range (Sales page upsells)
// POST { accountId, effectiveDate, scheduleStart, oldSchedule, newSchedule,
//        newFrequency, newPrice, newSubPay, subPricePerCleaning,
//        estimateUrl, estimateName, note }
//      Updates the account's CW price, sub pay and Frequency through the
//      usual account save (History line included), then saves the record.
//      The schedule itself is saved before this by the form (replaceSchedule
//      with keepOldUntilStart), so cleanings before the change stay as they were.
//
// All prices are before tax, like everywhere else in the CRM.

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { getSql } from "@/lib/db";
import { accountsOnPostgres, updateAccountFieldsDirect } from "@/lib/data/accounts";
import { describeAccountChanges } from "@/lib/accountChanges";
import { logActivity } from "@/lib/activityLog";
import { invalidateAccountLists } from "@/app/api/accounts/route";
import { addPriceChange, listAccountPriceChanges, listPriceChangesBetween, priceChangesReady } from "@/lib/pg/price-changes";
import { fileAccountDocument } from "@/lib/pg/account-documents";

const noStore = { "Cache-Control": "no-store" };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const NOT_READY = "Price & frequency changes need a database update (migration 072) before they can be saved. Nothing was changed.";

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status, headers: noStore });
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/** "$1,250.50" → 1250.5; "" → null; anything else that is not an amount → NaN. */
function money(value: unknown): number | null {
  const raw = String(value ?? "").replace(/[$,\s]/g, "");
  if (!raw) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) / 100 : NaN;
}

const plain = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

export async function GET(request: NextRequest) {
  try {
    if (!(await priceChangesReady())) return NextResponse.json({ success: true, ready: false, changes: [] }, { headers: noStore });
    const params = request.nextUrl.searchParams;
    const accountId = text(params.get("accountId"));
    if (accountId) return NextResponse.json({ success: true, ready: true, changes: await listAccountPriceChanges(accountId) }, { headers: noStore });
    const from = text(params.get("from"));
    const to = text(params.get("to"));
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to)) return refuse("Which account, or which dates?");
    return NextResponse.json({ success: true, ready: true, changes: await listPriceChangesBetween(from, to) }, { headers: noStore });
  } catch (error) {
    console.error("[price-changes GET]", error instanceof Error ? error.message : error);
    return refuse("The changes did not load. Try again.", 500);
  }
}

export async function POST(request: NextRequest) {
  const identity = await getAdminIdentity(request);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const accountId = text(body.accountId);
  const effectiveDate = text(body.effectiveDate);
  const scheduleStart = text(body.scheduleStart);
  const newPrice = money(body.newPrice);
  const newSubPay = money(body.newSubPay);
  const perCleaning = money(body.subPricePerCleaning);
  const newFrequency = text(body.newFrequency);

  if (!accountId) return refuse("Which account?");
  if (!ISO_DAY.test(effectiveDate)) return refuse("Pick the effective date.");
  if (scheduleStart && !ISO_DAY.test(scheduleStart)) return refuse("The schedule start is not a date.");
  if (newPrice === null || Number.isNaN(newPrice)) return refuse("Type the new CW monthly price (before tax).");
  if (Number.isNaN(newSubPay)) return refuse("The sub monthly pay is not an amount.");
  if (Number.isNaN(perCleaning)) return refuse("The sub price per cleaning is not an amount.");
  if (!accountsOnPostgres()) return refuse("Price & frequency changes work only with accounts on the database.", 500);

  try {
    if (!(await priceChangesReady())) return refuse(NOT_READY, 503);

    const found = (await getSql().query(
      `SELECT btrim(id) AS id, account_name, monthly_revenue::text AS price, monthly_sub_pay::text AS sub_pay, frequency
       FROM accounts WHERE btrim(id) = $1 AND (to_jsonb(accounts)->>'deleted_at') IS NULL LIMIT 1`,
      [accountId]
    )) as { id: string; account_name: string; price: string | null; sub_pay: string | null; frequency: string | null }[];
    const account = found[0];
    if (!account) return refuse("This account was not found.", 404);

    const oldPrice = account.price === null ? null : Number(account.price);
    const oldSubPay = account.sub_pay === null ? null : Number(account.sub_pay);
    const oldFrequency = (account.frequency ?? "").trim();

    // Only what changed goes through the account save.
    const fields: Record<string, string> = {};
    if (oldPrice !== newPrice) fields.monthlyRevenue = plain(newPrice);
    if (newSubPay !== null && oldSubPay !== newSubPay) fields.monthlySubcontractorPay = plain(newSubPay);
    if (body.subPricePerCleaning !== undefined) fields.subPricePerCleaning = perCleaning === null ? "" : plain(perCleaning);
    if (newFrequency && newFrequency !== oldFrequency) fields.frequency = newFrequency;

    const who = String(identity?.name ?? "").trim() || "Staff";
    if (Object.keys(fields).length > 0) {
      const result = await updateAccountFieldsDirect(accountId, fields);
      await invalidateAccountLists();
      if (identity?.accountId) {
        const changed = describeAccountChanges(result.before, result.after);
        await logActivity({
          actorAccountId: identity.accountId,
          actorRole: identity.role ?? "manager",
          actorName: identity.name || "",
          action: "update",
          entityType: "account",
          entityId: accountId,
          detail: [`Price & frequency change, effective ${effectiveDate}`, changed].filter(Boolean).join("\n"),
        });
      }
    }

    const change = await addPriceChange({
      accountId,
      accountName: account.account_name ?? "",
      effectiveDate,
      scheduleStart,
      oldSchedule: text(body.oldSchedule),
      newSchedule: text(body.newSchedule),
      oldFrequency,
      newFrequency: newFrequency || oldFrequency,
      oldPrice,
      newPrice,
      oldSubPay,
      newSubPay: newSubPay ?? oldSubPay,
      estimateUrl: text(body.estimateUrl),
      estimateName: text(body.estimateName),
      note: text(body.note),
      createdBy: who,
    });
    // The signed estimate also goes in the account's Documents (best effort, never fails the save).
    if (change && text(body.estimateUrl)) {
      await fileAccountDocument({
        sourceKey: `price-change:${change.id}`,
        accountId,
        accountName: account.account_name ?? "",
        name: text(body.estimateName).replace(/\.[^.]+$/, "") || "Accepted estimate",
        docType: "Accepted estimate",
        note: `Price & frequency change, effective ${effectiveDate}`,
        fileUrl: text(body.estimateUrl),
        fileName: text(body.estimateName),
        uploadedBy: who,
      });
    }
    return NextResponse.json({ success: true, change }, { headers: noStore });
  } catch (error) {
    console.error("[price-changes POST]", error instanceof Error ? error.message : error);
    return refuse(error instanceof Error && /amount|not found/i.test(error.message) ? error.message : "The change was not saved. Try again.", 500);
  }
}
