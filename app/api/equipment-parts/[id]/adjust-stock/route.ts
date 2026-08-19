import { NextRequest, NextResponse } from "next/server";
import { adjustEquipmentPartStock, type PartStockAdjustReason } from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_REASONS: PartStockAdjustReason[] = ["Used", "Restocked", "Correction"];

function errorStatus(err: unknown): number {
  return err instanceof Error && err.message.includes("not found") ? 404 : 500;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { delta?: number; reason?: string };

    const delta = Number(body.delta);
    if (!Number.isFinite(delta) || delta === 0) {
      return NextResponse.json({ success: false, error: "delta must be a non-zero number." }, { status: 400 });
    }
    const reason = body.reason?.trim();
    if (!reason || !VALID_REASONS.includes(reason as PartStockAdjustReason)) {
      return NextResponse.json(
        { success: false, error: "reason must be one of Used, Restocked, Correction." },
        { status: 400 }
      );
    }

    const part = await adjustEquipmentPartStock(id, delta, reason as PartStockAdjustReason);
    return NextResponse.json({ success: true, part });
  } catch (err) {
    console.error("[equipment-parts/[id]/adjust-stock PATCH]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to adjust stock." },
      { status: errorStatus(err) }
    );
  }
}
