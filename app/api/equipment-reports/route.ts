// Admin-only. Equipment Check report history: ?equipmentId= for an item's
// history, ?staffId= for one person's. Names are resolved from the Sheets
// Staff/Equipment tabs at read time (the table stores ids only).
import { NextRequest, NextResponse } from "next/server";
import { fetchStaff, fetchEquipmentList } from "@/lib/googleSheets";
import { listEquipmentReportsForEquipment, listEquipmentReportsForStaff } from "@/lib/equipmentCheckDb";

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const equipmentId = searchParams.get("equipmentId")?.trim() ?? "";
    const staffId = searchParams.get("staffId")?.trim() ?? "";
    if (!equipmentId && !staffId) {
      return NextResponse.json({ success: false, error: "equipmentId or staffId is required." }, { status: 400 });
    }

    const [reports, staff, equipment] = await Promise.all([
      equipmentId ? listEquipmentReportsForEquipment(equipmentId) : listEquipmentReportsForStaff(staffId),
      fetchStaff(),
      fetchEquipmentList(),
    ]);
    const staffNameById = new Map(staff.map((s) => [s.id, s.name]));
    const equipmentById = new Map(equipment.map((e) => [e.id, e]));

    return NextResponse.json({
      success: true,
      reports: reports.map((r) => {
        const item = equipmentById.get(r.equipmentId);
        return {
          ...r,
          staffName: staffNameById.get(r.staffId) ?? r.staffId,
          equipmentName: item?.name ?? r.equipmentId,
          equipmentTag: item?.serialNumber ?? "",
        };
      }),
    });
  } catch (error) {
    console.error("[equipment-reports GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load reports." }, { status: 500 });
  }
}
