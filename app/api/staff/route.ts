import { NextRequest, NextResponse } from "next/server";
import { appendStaff, fetchStaff, type StaffRole } from "@/lib/googleSheets";

const VALID_ROLES: StaffRole[] = ["Manager", "OfficeStaff", "InsideStaff"];

export async function GET() {
  try {
    const staff = await fetchStaff();
    return NextResponse.json({ success: true, staff });
  } catch (err) {
    console.error("[staff GET]", err);
    return NextResponse.json({ success: false, error: "Failed to load staff." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { name?: string; role?: string; active?: boolean };
    const name = body.name?.trim();
    const role = body.role?.trim();

    if (!name) {
      return NextResponse.json({ success: false, error: "Name is required." }, { status: 400 });
    }
    if (!role || !VALID_ROLES.includes(role as StaffRole)) {
      return NextResponse.json(
        { success: false, error: "Role must be one of Manager, OfficeStaff, InsideStaff." },
        { status: 400 }
      );
    }

    const id = await appendStaff({ name, role: role as StaffRole, active: body.active ?? true });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[staff POST]", err);
    return NextResponse.json({ success: false, error: "Failed to create staff record." }, { status: 500 });
  }
}
