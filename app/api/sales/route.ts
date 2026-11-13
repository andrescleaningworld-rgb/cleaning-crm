import { NextRequest, NextResponse } from "next/server";
import { appendSale, fetchSales, updateSale } from "@/lib/data/sales";
import type { SaleEdit } from "@/lib/pg/sales";
import { RECURRING_PERCENT, getCommissionType, validateRecurringDates } from "@/lib/salesCommission";

// Migrated off the Apps Script backend (see lib/googleSheets.ts's Sales &
// Commissions section) — direct Sheets API only, so the new
// RecurringStartDate/RecurringEndDate columns can be written as part of the
// same request that creates a sale.

export async function GET() {
  try {
    const sales = await fetchSales();
    return NextResponse.json(
      { success: true, sales },
      { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("[sales GET]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load sales." },
      { status: 500 }
    );
  }
}

type SaleBody = {
  id?: string;
  sheetRow?: number;
  accountId?: string;
  accountName?: string;
  saleDate?: string;
  serviceSold?: string;
  workOrderEstimateNumber?: string;
  soldBy?: string;
  amountSold?: number;
  commissionPercent?: number;
  status?: string;
  notes?: string;
  serviceType?: string;
  manager?: string;
  recurringStartDate?: string;
  recurringEndDate?: string;
};

const refuse = (error: string, status = 400) => NextResponse.json({ success: false, error }, { status });

/**
 * The sale's own fields, checked the same way for Add (POST) and Edit (PATCH).
 * Returns what to tell the person, or the fields.
 */
function readSaleFields(body: SaleBody): { error: string } | { fields: SaleEdit } {
  const saleDate = body.saleDate?.trim() ?? "";
  const serviceSold = body.serviceSold?.trim() ?? "";
  const soldBy = body.soldBy?.trim() ?? "";
  const amountSold = Number(body.amountSold);
  const commissionPercent = Number(body.commissionPercent);

  if (!saleDate || !serviceSold || !soldBy || !Number.isFinite(amountSold)) {
    return { error: "Missing required sale fields (date, service, sold by, amount)." };
  }
  // Only the two commissions: One-time 10% or Recurring 4% (old sales at another % are left as they are until changed).
  if (getCommissionType(commissionPercent) === "Other") return { error: "Pick One-time (10%) or Recurring (4%)." };

  const recurringStartDate = body.recurringStartDate?.trim() ?? "";
  const recurringEndDate = body.recurringEndDate?.trim() ?? "";
  const validationError = validateRecurringDates(commissionPercent, recurringStartDate, recurringEndDate);
  if (validationError) return { error: validationError };

  return {
    fields: {
      saleDate,
      serviceSold,
      workOrderEstimateNumber: body.workOrderEstimateNumber?.trim() ?? "",
      soldBy,
      amountSold,
      commissionPercent,
      status: body.status?.trim() || "Pending",
      notes: body.notes?.trim() ?? "",
      serviceType: body.serviceType?.trim() ?? "",
      // Blank for One-time sales even if the client sent something: the dates only mean something for Recurring.
      recurringStartDate: commissionPercent === RECURRING_PERCENT ? recurringStartDate : "",
      recurringEndDate: commissionPercent === RECURRING_PERCENT ? recurringEndDate : "",
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as SaleBody;
    const accountName = body.accountName?.trim();
    if (!accountName) return refuse("Missing required sale fields (account, date, service, sold by, amount).");
    const read = readSaleFields(body);
    if ("error" in read) return refuse(read.error);

    const id = await appendSale({
      ...read.fields,
      accountId: body.accountId?.trim() ?? "",
      accountName,
      manager: body.manager?.trim() ?? "",
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[sales POST]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save sale." },
      { status: 500 }
    );
  }
}

/** Sales page → Edit: changes one sale (not its account). A sale made by an extra job is changed on the job. */
export async function PATCH(request: NextRequest) {
  try {
    const body = (await request.json()) as SaleBody;
    const id = body.id?.trim() ?? "";
    const sheetRow = Number(body.sheetRow);
    if (!id || !Number.isInteger(sheetRow)) return refuse("Which sale? Reload the page and try again.");
    const read = readSaleFields(body);
    if ("error" in read) return refuse(read.error);

    const result = await updateSale(id, sheetRow, read.fields);
    if (result === "not-found") return refuse("That sale was not found. Reload the page.", 404);
    if (result === "extra-job") return refuse("This sale was made by an extra job. Change it on the extra job.", 409);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[sales PATCH]", err);
    return refuse(err instanceof Error ? err.message : "That did not save. Try again.", 500);
  }
}
