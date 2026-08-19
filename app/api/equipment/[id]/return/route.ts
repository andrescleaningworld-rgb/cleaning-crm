import { NextRequest, NextResponse } from "next/server";
import {
  getActiveSigningStaffById,
  getEquipmentById,
  getOpenCheckoutForEquipment,
  updateEquipmentCheckout,
  updateEquipmentFields,
} from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

// Rough signal for "does this condition note describe damage" when the
// caller doesn't pass an explicit `damaged` flag. Full maintenance CRUD is a
// later phase — this only sets the NeedsMaintenanceReview flag for now.
const DAMAGE_KEYWORDS = /damag|broken|crack|not working|malfunction|leak|torn|dent/i;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      conditionAtReturn?: string;
      signedInByStaffId?: string;
      damaged?: boolean;
    };

    const conditionAtReturn = body.conditionAtReturn?.trim();
    const signedInByStaffId = body.signedInByStaffId?.trim();

    if (!conditionAtReturn) {
      return NextResponse.json({ success: false, error: "conditionAtReturn is required." }, { status: 400 });
    }
    if (!signedInByStaffId) {
      return NextResponse.json({ success: false, error: "Missing signedInByStaffId." }, { status: 400 });
    }

    const [equipment, signer] = await Promise.all([
      getEquipmentById(id),
      getActiveSigningStaffById(signedInByStaffId),
    ]);

    if (!equipment) {
      return NextResponse.json({ success: false, error: "Equipment not found." }, { status: 404 });
    }
    if (equipment.status !== "CheckedOut") {
      return NextResponse.json(
        { success: false, error: `Equipment is not CheckedOut (current status: ${equipment.status}).` },
        { status: 409 }
      );
    }
    if (!signer) {
      return NextResponse.json(
        { success: false, error: "Signing staff must be an Active Manager or Office Staff record." },
        { status: 403 }
      );
    }

    const openCheckout = await getOpenCheckoutForEquipment(equipment.id);
    if (!openCheckout) {
      return NextResponse.json(
        { success: false, error: "No open checkout found for this equipment." },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const isDamaged = body.damaged === true || (body.damaged === undefined && DAMAGE_KEYWORDS.test(conditionAtReturn));

    await updateEquipmentCheckout(openCheckout.sheetRow, {
      returnedAt: now,
      conditionAtReturn,
      signedInByStaffId: signer.id,
      signedInByStaffName: signer.name,
    });

    await updateEquipmentFields(equipment.id, {
      status: "Available",
      currentHolderType: "",
      currentHolderId: "",
      currentHolderName: "",
      checkedOutAt: "",
      expectedReturnAt: "",
      conditionNotes: conditionAtReturn,
      ...(isDamaged ? { needsMaintenanceReview: true } : {}),
    });

    return NextResponse.json({ success: true, needsMaintenanceReview: isDamaged });
  } catch (err) {
    console.error("[equipment/[id]/return POST]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to return equipment." },
      { status: 500 }
    );
  }
}
