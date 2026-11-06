// Public route (under "/api/equipment-check") — tells the tablet page
// whether this browser also has a manager/owner login (the normal admin
// cookie), so it can show a small "Exit to Equipment" button. Returns only
// a yes/no; the CRM pages themselves stay behind the normal proxy.ts admin
// gate either way, so an employee still can't reach them.
import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { getAdminIdentity } from "@/lib/adminSession";
import { checkEquipmentCheckLinkKey } from "@/lib/equipmentCheckDb";

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  try {
    const { key } = await params;
    if (!(await checkEquipmentCheckLinkKey(key))) return filesJson({ success: true, isManager: false });
    const identity = await getAdminIdentity(request);
    return filesJson({ success: true, isManager: Boolean(identity) });
  } catch {
    return filesJson({ success: true, isManager: false });
  }
}
