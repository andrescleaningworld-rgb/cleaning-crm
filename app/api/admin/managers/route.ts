import { NextRequest, NextResponse } from "next/server";
import { fetchManagers, appendManager, updateManager } from "@/lib/googleSheets";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

export async function GET() {
  try {
    const managers = await fetchManagers();
    return NextResponse.json(managers);
  } catch (err) {
    console.error("[managers GET]", err);
    return NextResponse.json({ error: "Failed to load managers" }, { status: 500 });
  }
}

// Add a new manager
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { name?: string; phone?: string; status?: string };
    const name = body.name?.trim();
    if (!name) return NextResponse.json({ error: "Manager name required" }, { status: 400 });

    const managerId = await appendManager({
      name,
      phone: body.phone?.trim() ?? "",
      status: body.status?.trim() || "Active",
    });

    const actor = await getAdminIdentity(request);
    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "owner",
        actorName: actor.name || "",
        action: "create",
        entityType: "manager",
        entityId: managerId,
        detail: `added ${name}`,
      });
    }

    return NextResponse.json({ success: true, managerId });
  } catch (err) {
    console.error("[managers POST]", err);
    return NextResponse.json({ error: "Failed to add manager" }, { status: 500 });
  }
}

// Update name/phone/status/calendarColorId for an existing manager
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json() as {
      sheetRow?: number;
      fields?: {
        name?: string;
        phone?: string;
        status?: string;
        calendarColorId?: string;
      };
    };

    const { sheetRow, fields } = body;
    if (!sheetRow || !fields) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

    await updateManager(sheetRow, fields);

    const actor = await getAdminIdentity(request);
    if (actor?.accountId) {
      await logActivity({
        actorAccountId: actor.accountId,
        actorRole: actor.role ?? "owner",
        actorName: actor.name || "",
        action: "update",
        entityType: "manager",
        entityId: String(sheetRow),
        detail: Object.keys(fields).join(", "),
      });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[managers PATCH]", err);
    return NextResponse.json({ error: "Failed to update manager" }, { status: 500 });
  }
}
