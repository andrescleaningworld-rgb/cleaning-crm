// The Sub Packet link: /sub-packet/<token> opens the packet with no login,
// like the packet email (public in proxy.ts; the token is checked here, see
// lib/subPacketLink.ts). The page is the email's own HTML, with a PDF link
// at the bottom (./pdf).

import { NextRequest } from "next/server";
import { subPacketHtml } from "@/lib/subPacket";
import { PACKET_PAGE_HEADERS, packetLinkGone, subPacketForToken } from "@/lib/subPacketLink";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const token = (await context.params).token;
    const data = await subPacketForToken(token, request.nextUrl.origin);
    if (!data) return packetLinkGone();
    const html = subPacketHtml(data, { pdfUrl: `${request.nextUrl.origin}/sub-packet/${token}/pdf` });
    return new Response(html, { headers: { ...PACKET_PAGE_HEADERS, "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    console.error("[sub-packet link]", error instanceof Error ? error.message : error);
    return packetLinkGone(500);
  }
}
