// Opening an uploaded file (lib/files.ts). Public in proxy.ts: this route
// checks for itself. Let in: logged-in staff, or a short-lived signed link
// (?e=&s=) that a sub, customer, TV or crew screen handed out for a file it
// is allowed to show. Then the browser is sent to a storage link that works
// for a few minutes only. Anyone else gets "not found".

import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { privateFilesOn, signatureOk, storageLink } from "@/lib/files";

type Context = { params: Promise<{ path: string[] }> };

// Next may hand the parts over still encoded: decode once, keep the part as it is when it is not encoded.
function safeDecode(part: string): string {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

const notFound = () => new NextResponse("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const { path } = await params;
    const pathname = (path ?? []).map(safeDecode).join("/");
    if (!pathname || pathname.includes("..") || !privateFilesOn()) return notFound();
    const query = request.nextUrl.searchParams;
    const allowed = signatureOk(pathname, query.get("e"), query.get("s")) || (await getAdminIdentity(request)) !== null;
    if (!allowed) return notFound();
    const link = await storageLink(pathname);
    return NextResponse.redirect(link, { status: 302, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[files GET]", error instanceof Error ? error.message : error);
    return notFound();
  }
}
