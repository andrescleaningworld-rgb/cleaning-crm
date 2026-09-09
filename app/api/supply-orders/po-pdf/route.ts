import { NextRequest, NextResponse } from "next/server";
import { renderSupplyOrderPoPdf, type SupplyOrderPoItem } from "@/lib/pdf/supply-order-po";

// Admin-only: this path isn't listed in proxy.ts's PUBLIC_PATHS, SUB_PATHS,
// or SUB_OR_ADMIN_PATHS, so it falls through to proxy.ts's default branch,
// which requires a valid admin session — same pattern as
// app/api/accounts/[id]/pdf/route.ts.

// Unlike the account packet PDF (which re-fetches account data server-side
// by ID via Apps Script), the client already has the full order-group data
// loaded (same admin-only page, same data source) — POSTing it directly
// avoids re-deriving a "look up a group by ID" server path that doesn't
// exist anywhere else in this app, for no real benefit in this trust
// boundary. Pure local rendering (no upstream fetch), so no maxDuration
// override is needed — this isn't bound by Apps Script latency.

type PoPdfRequestBody = {
  poNumber?: string;
  orderDate?: string;
  accountName?: string;
  accountId?: string;
  subcontractor?: string;
  subcontractorEmail?: string;
  deliveryMode?: string;
  deliveryAddress?: string;
  orderIds?: string[];
  items?: SupplyOrderPoItem[];
};

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

// Filenames can't safely contain the characters Content-Disposition (or most
// filesystems) choke on — strip down to something universally safe, same
// approach as app/api/accounts/[id]/pdf/route.ts's slugifyFilenamePart.
function slugifyFilenamePart(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9 _-]/g, "").replace(/\s+/g, " ").trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as PoPdfRequestBody;

    const poNumber = cleanText(body.poNumber);
    if (!poNumber) {
      return NextResponse.json(
        { success: false, error: "Missing PO number." },
        { status: 400 }
      );
    }

    const items: SupplyOrderPoItem[] = Array.isArray(body.items)
      ? body.items.map((item) => ({
          supplyItem: cleanText(item.supplyItem),
          description: cleanText(item.description),
          category: cleanText(item.category),
          quantity: cleanText(item.quantity),
          notes: cleanText(item.notes),
        }))
      : [];

    const generatedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const pdfBuffer = await renderSupplyOrderPoPdf({
      poNumber,
      orderDate: cleanText(body.orderDate),
      accountName: cleanText(body.accountName),
      accountId: cleanText(body.accountId),
      subcontractor: cleanText(body.subcontractor),
      subcontractorEmail: cleanText(body.subcontractorEmail),
      deliveryMode: cleanText(body.deliveryMode),
      deliveryAddress: cleanText(body.deliveryAddress),
      orderIds: Array.isArray(body.orderIds) ? body.orderIds.map(cleanText).filter(Boolean) : [],
      items,
      generatedDate,
    });

    const accountPart = cleanText(body.accountName) ? ` - ${slugifyFilenamePart(cleanText(body.accountName))}` : "";
    const filename = `${slugifyFilenamePart(poNumber)}${accountPart}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[supply-orders/po-pdf POST]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate the PO PDF.",
      },
      { status: 500 }
    );
  }
}
