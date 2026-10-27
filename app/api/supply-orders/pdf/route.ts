// Staff only (proxy.ts default gate). One or more supply orders as the
// Supply Order PDF (lib/pdf/supply-order.tsx), one order per page:
//
//   GET ?o=<order key>&o=<order key>            the PDF, as a download
//   GET ?o=<order key>&format=json              the same orders as data (the print page)
//
// Order keys are the cards' keys ("crew-<id>", "group:<id>", "fallback:...").
// Read only.

import { NextRequest, NextResponse } from "next/server";
import { loadSupplyOrderDocs, supplyOrderFileName } from "@/lib/pg/supply-order-docs";
import { renderSupplyOrderPdf } from "@/lib/pdf/supply-order";

export const maxDuration = 45;

const MAX_ORDERS = 100;
const noStore = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  try {
    const keys = request.nextUrl.searchParams.getAll("o").map((key) => key.trim()).filter(Boolean);
    if (keys.length === 0) return NextResponse.json({ success: false, error: "Pick an order first." }, { status: 400, headers: noStore });
    if (keys.length > MAX_ORDERS) return NextResponse.json({ success: false, error: `At most ${MAX_ORDERS} orders at a time.` }, { status: 400, headers: noStore });

    const docs = await loadSupplyOrderDocs(keys);
    if (request.nextUrl.searchParams.get("format") === "json") return NextResponse.json({ success: true, orders: docs }, { headers: noStore });
    if (docs.length === 0) return NextResponse.json({ success: false, error: "That order was not found. It may have been removed." }, { status: 404, headers: noStore });

    const pdf = await renderSupplyOrderPdf(docs);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${supplyOrderFileName(docs)}"`,
        ...noStore,
      },
    });
  } catch (error) {
    console.error("[supply-orders pdf]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The PDF could not be made. Try again." }, { status: 500, headers: noStore });
  }
}
