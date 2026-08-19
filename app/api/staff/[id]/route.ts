import { NextRequest, NextResponse } from "next/server";
import { updateStaff, type StaffRole } from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

const VALID_ROLES: StaffRole[] = ["Manager", "OfficeStaff", "InsideStaff"];

function errorStatus(err: unknown): number {
  return err instanceof Error && err.message.includes("not found") ? 404 : 500;
}

// Editing/deactivating an existing Staff record — not in the original DO
// list (only GET/POST were required), but needed so a mis-assigned Role or
// a departed employee can be fixed without hand-editing the sheet. Soft
// deactivate only (Active=No), matching this app's no-hard-delete convention.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as { name?: string; role?: string; active?: boolean };

    const fields: Partial<{ name: string; role: StaffRole; active: boolean }> = {};
    if (body.name !== undefined) fields.name = body.name.trim();
    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role as StaffRole)) {
        return NextResponse.json(
          { success: false, error: "Role must be one of Manager, OfficeStaff, InsideStaff." },
          { status: 400 }
        );
      }
      fields.role = body.role as StaffRole;
    }
    if (body.active !== undefined) fields.active = body.active;

    await updateStaff(id, fields);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[staff/[id] PATCH]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update staff record." },
      { status: errorStatus(err) }
    );
  }
}
