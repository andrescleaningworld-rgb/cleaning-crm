// Every hour (vercel.json): copies new Office TV pictures from the Google
// Drive folder to Blob and removes copies of pictures taken out of it
// (lib/pg/tv-slideshow.ts). Nothing happens while the Drive switch is off.
// Vercel Cron calls it with CRON_SECRET (/api/cron is public in proxy.ts).

import { NextRequest, NextResponse } from "next/server";
import { syncDriveSlides } from "@/lib/pg/tv-slideshow";

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json({ success: true, result: await syncDriveSlides(240_000) });
  } catch (error) {
    console.error("[cron tv-slideshow]", error instanceof Error ? error.message : error);
    return NextResponse.json({ success: false, error: "The copy did not run." }, { status: 500 });
  }
}
