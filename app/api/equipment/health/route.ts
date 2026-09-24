// Admin-only (proxy.ts default admin gate). The tablet side of each item's
// status for the Equipment list: the newest Equipment Check report per item,
// reduced to "lost" | "damaged" | null. A "damaged" report stops counting
// once a repair on that item was completed after it. Reads Postgres
// (equipment_reports) plus the cached EquipmentRepairs tab — no writes.
import { NextResponse } from "next/server";
import { listLatestEquipmentReports } from "@/lib/equipmentCheckDb";
import { fetchEquipmentRepairs } from "@/lib/googleSheets";

export type EquipmentTabletFlag = { condition: "lost" | "damaged"; reportedAt: string };

export async function GET() {
  try {
    const [reports, repairs] = await Promise.all([listLatestEquipmentReports(), fetchEquipmentRepairs()]);

    const lastRepairDone = new Map<string, number>();
    for (const repair of repairs) {
      const done = repair.completedAt ? new Date(repair.completedAt).getTime() : NaN;
      if (Number.isFinite(done) && done > (lastRepairDone.get(repair.equipmentId) ?? 0)) {
        lastRepairDone.set(repair.equipmentId, done);
      }
    }

    const flags: Record<string, EquipmentTabletFlag> = {};
    for (const report of reports) {
      if (report.condition === "lost") {
        flags[report.equipmentId] = { condition: "lost", reportedAt: report.createdAt };
      } else if (report.condition === "damaged") {
        const reportedAt = new Date(report.createdAt).getTime();
        if (reportedAt > (lastRepairDone.get(report.equipmentId) ?? 0)) {
          flags[report.equipmentId] = { condition: "damaged", reportedAt: report.createdAt };
        }
      }
    }
    return NextResponse.json({ success: true, flags });
  } catch (err) {
    console.error("[equipment/health GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load tablet reports." }, { status: 500 });
  }
}
