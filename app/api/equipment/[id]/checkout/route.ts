import { NextRequest, NextResponse } from "next/server";
import {
  appendEquipmentCheckout,
  getActiveSigningStaffById,
  getAllSubcontractorsRaw,
  getEquipmentById,
  getStaffById,
  updateEquipmentFields,
  type EquipmentHolderType,
} from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      holderType?: string;
      holderId?: string;
      signedOutByStaffId?: string;
      accountId?: string;
      expectedReturnAt?: string;
    };

    const holderType = body.holderType?.trim();
    const holderId = body.holderId?.trim();
    const signedOutByStaffId = body.signedOutByStaffId?.trim();

    if (holderType !== "InsideStaff" && holderType !== "Sub") {
      return NextResponse.json(
        { success: false, error: "holderType must be InsideStaff or Sub." },
        { status: 400 }
      );
    }
    if (!holderId) {
      return NextResponse.json({ success: false, error: "Missing holderId." }, { status: 400 });
    }
    if (!signedOutByStaffId) {
      return NextResponse.json({ success: false, error: "Missing signedOutByStaffId." }, { status: 400 });
    }

    // Independent reads — different tabs, run in parallel.
    const [equipment, signer] = await Promise.all([
      getEquipmentById(id),
      getActiveSigningStaffById(signedOutByStaffId),
    ]);

    if (!equipment) {
      return NextResponse.json({ success: false, error: "Equipment not found." }, { status: 404 });
    }
    if (equipment.status !== "Available") {
      return NextResponse.json(
        { success: false, error: `Equipment is not Available (current status: ${equipment.status}).` },
        { status: 409 }
      );
    }
    if (!signer) {
      return NextResponse.json(
        { success: false, error: "Signing staff must be an Active Manager or Office Staff record." },
        { status: 403 }
      );
    }

    // HolderId must validate against a real record — no free-text holder names.
    let holderName = "";
    if (holderType === "InsideStaff") {
      const holderStaff = await getStaffById(holderId);
      if (!holderStaff || !holderStaff.active) {
        return NextResponse.json(
          { success: false, error: "Holder must be an Active Staff record." },
          { status: 400 }
        );
      }
      holderName = holderStaff.name;
    } else {
      const subcontractors = await getAllSubcontractorsRaw();
      const holderSub = subcontractors.find((s) => s.id === holderId);
      if (!holderSub) {
        return NextResponse.json(
          { success: false, error: "Holder must be a real Subcontractor record." },
          { status: 400 }
        );
      }
      holderName = holderSub.companyName || holderSub.contactName || holderId;
    }

    const now = new Date().toISOString();
    const expectedReturnAt = body.expectedReturnAt?.trim() ?? "";
    const accountId = body.accountId?.trim() ?? "";

    await appendEquipmentCheckout({
      equipmentId: equipment.id,
      holderType: holderType as EquipmentHolderType,
      holderId,
      holderName,
      accountId,
      checkedOutAt: now,
      expectedReturnAt,
      conditionAtCheckout: equipment.conditionNotes,
      signedOutByStaffId: signer.id,
      signedOutByStaffName: signer.name,
    });

    await updateEquipmentFields(equipment.id, {
      status: "CheckedOut",
      currentHolderType: holderType as EquipmentHolderType,
      currentHolderId: holderId,
      currentHolderName: holderName,
      checkedOutAt: now,
      expectedReturnAt,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[equipment/[id]/checkout POST]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to check out equipment." },
      { status: 500 }
    );
  }
}
