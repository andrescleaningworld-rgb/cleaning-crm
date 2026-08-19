import { NextRequest, NextResponse } from "next/server";
import { appendSale, fetchSales } from "@/lib/googleSheets";
import { validateRecurringDates } from "@/lib/salesCommission";

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

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
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

    const accountName = body.accountName?.trim();
    const saleDate = body.saleDate?.trim();
    const serviceSold = body.serviceSold?.trim();
    const soldBy = body.soldBy?.trim();
    const amountSold = Number(body.amountSold);
    const commissionPercent = Number(body.commissionPercent);

    if (!accountName || !saleDate || !serviceSold || !soldBy || !Number.isFinite(amountSold)) {
      return NextResponse.json(
        { success: false, error: "Missing required sale fields (account, date, service, sold by, amount)." },
        { status: 400 }
      );
    }
    if (!Number.isFinite(commissionPercent)) {
      return NextResponse.json({ success: false, error: "Commission % must be a number." }, { status: 400 });
    }

    const recurringStartDate = body.recurringStartDate?.trim() ?? "";
    const recurringEndDate = body.recurringEndDate?.trim() ?? "";

    const validationError = validateRecurringDates(commissionPercent, recurringStartDate, recurringEndDate);
    if (validationError) {
      return NextResponse.json({ success: false, error: validationError }, { status: 400 });
    }

    const id = await appendSale({
      accountId: body.accountId?.trim() ?? "",
      accountName,
      saleDate,
      serviceSold,
      workOrderEstimateNumber: body.workOrderEstimateNumber?.trim() ?? "",
      soldBy,
      amountSold,
      commissionPercent,
      status: body.status?.trim() || "Pending",
      notes: body.notes?.trim() ?? "",
      serviceType: body.serviceType?.trim() ?? "",
      manager: body.manager?.trim() ?? "",
      // Blank for non-Recurring sales even if the client sent something —
      // validateRecurringDates already confirmed these are only meaningful
      // (and only required) when commissionPercent === 4.
      recurringStartDate: commissionPercent === 4 ? recurringStartDate : "",
      recurringEndDate: commissionPercent === 4 ? recurringEndDate : "",
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
