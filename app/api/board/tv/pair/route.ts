// A TV that is not connected yet asks here for its 6-digit code, and asks
// again every few seconds to learn when the owner has typed it on a phone.
// No login (proxy.ts: "/api/board/tv" and everything under it). Nothing about
// the board leaves here: only the TV's own code, or "connected".

import { NextRequest, NextResponse } from "next/server";
import { boardReady, startTvPairing } from "@/lib/pg/board";

const noStore = { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } };

export async function POST(request: NextRequest) {
  try {
    if (!(await boardReady())) return NextResponse.json({ success: true, ready: false }, noStore);
    const body = (await request.json().catch(() => ({}))) as { secret?: unknown };
    const pairing = await startTvPairing(typeof body.secret === "string" ? body.secret : "");
    return NextResponse.json({ success: true, ready: true, ...pairing }, noStore);
  } catch (error) {
    console.error("[board tv pair]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The code did not load." }, { status: 500, ...noStore });
  }
}
