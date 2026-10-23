// The Sub Packet link's PDF: /sub-packet/<token>/pdf, the same PDF the packet
// email attaches. Same token check as the page (lib/subPacketLink.ts).

import { NextRequest } from "next/server";
import { renderSubPacketPdf } from "@/lib/pdf/sub-packet";
import { subPacketPdfFilename } from "@/lib/subPacket";
import { PACKET_PAGE_HEADERS, packetLinkGone, subPacketForToken } from "@/lib/subPacketLink";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const data = await subPacketForToken((await context.params).token, request.nextUrl.origin);
    if (!data) return packetLinkGone();
    const pdf = await renderSubPacketPdf(data);
    // A header carries plain ASCII only: "Café" becomes "Cafe".
    const filename = subPacketPdfFilename(data).normalize("NFKD").replace(/[^\x20-\x7e]/g, "").replace(/["\\]/g, "");
    return new Response(new Uint8Array(pdf), {
      headers: { ...PACKET_PAGE_HEADERS, "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${filename}"` },
    });
  } catch (error) {
    console.error("[sub-packet link pdf]", error instanceof Error ? error.message : error);
    return packetLinkGone(500);
  }
}
