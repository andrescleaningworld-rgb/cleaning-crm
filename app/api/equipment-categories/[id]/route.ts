import { NextRequest, NextResponse } from "next/server";
import { updateEquipmentCategory } from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

function errorStatus(err: unknown): number {
  return err instanceof Error && err.message.includes("not found") ? 404 : 500;
}

// Soft-disable only (Active=No) — never a hard delete. A deactivated
// category must keep resolving a label for any Equipment row that already
// references it (see lib/googleSheets.ts's Equipment Categories section).
async function handleUpdate(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { name?: string; active?: boolean };

    const fields: Partial<{ name: string; active: boolean }> = {};
    if (body.name !== undefined) fields.name = body.name.trim();
    if (body.active !== undefined) fields.active = body.active;

    await updateEquipmentCategory(id, fields);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[equipment-categories/[id] PATCH]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update equipment category." },
      { status: errorStatus(err) }
    );
  }
}

export const PATCH = handleUpdate;
