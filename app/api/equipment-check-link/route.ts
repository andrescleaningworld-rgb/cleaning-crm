// Admin-only (normal proxy.ts admin gate — "/api/equipment-check-link" is
// NOT under the public "/api/equipment-check" prefix, since matchesPath
// needs a "/" boundary). GET returns the secret tablet link path (creating
// the key on first use); POST replaces it ("New link"), which stops the old
// link and signs out any open tablet session.
import { NextResponse } from "next/server";
import { getOrCreateEquipmentCheckLink, regenerateEquipmentCheckLink } from "@/lib/equipmentCheckDb";

function linkPath(key: string): string {
  return `/equipment-check/${encodeURIComponent(key)}`;
}

export async function GET() {
  try {
    const link = await getOrCreateEquipmentCheckLink();
    return NextResponse.json({ success: true, path: linkPath(link.key) });
  } catch (error) {
    console.error("[equipment-check-link GET]", error);
    return NextResponse.json({ success: false, error: "Failed to load the tablet link." }, { status: 500 });
  }
}

export async function POST() {
  try {
    const link = await regenerateEquipmentCheckLink();
    return NextResponse.json({ success: true, path: linkPath(link.key) });
  } catch (error) {
    console.error("[equipment-check-link POST]", error);
    return NextResponse.json({ success: false, error: "Failed to make a new tablet link." }, { status: 500 });
  }
}
