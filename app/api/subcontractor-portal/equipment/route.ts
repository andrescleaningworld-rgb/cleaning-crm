import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { fetchEquipmentList, getAllSubcontractorsRaw } from "@/lib/googleSheets";

// Session-scoped read for the subcontractor portal's equipment view — never
// exposes the full inventory (cost, other subs' assignments) to a logged-in
// sub, only equipment currently checked out to them. Identity comes from the
// sub_session cookie, never a client-supplied id (same IDOR-closing pattern
// as app/api/subcontractor-portal/route.ts).
export async function GET(request: NextRequest) {
  try {
    const readResponse = NextResponse.json({});
    const session = await getIronSession<SubSessionData>(request, readResponse, subSessionOptions());

    if (!session.subcontractorEmail) {
      return NextResponse.json({ success: false, error: "Not logged in." }, { status: 401 });
    }

    const emailLower = session.subcontractorEmail.trim().toLowerCase();
    const [subcontractors, equipment] = await Promise.all([
      getAllSubcontractorsRaw(),
      fetchEquipmentList(),
    ]);

    const sub = subcontractors.find((s) => (s.email ?? "").trim().toLowerCase() === emailLower);
    if (!sub) {
      return NextResponse.json({ success: true, equipment: [] });
    }

    const myEquipment = equipment.filter(
      (e) => e.currentHolderType === "Sub" && e.currentHolderId === sub.id
    );

    return NextResponse.json({ success: true, equipment: myEquipment });
  } catch (err) {
    console.error("[subcontractor-portal/equipment GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load your equipment." }, { status: 500 });
  }
}
