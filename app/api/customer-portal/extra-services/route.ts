import { NextResponse } from "next/server";
import { fetchExtraServices } from "@/lib/googleSheets";

// Public, read-only, always active-only — unlike /api/extra-services (admin
// CRUD, gated behind an admin session by proxy.ts), this route lives under
// /api/customer-portal, which proxy.ts already treats as a public prefix.
// Only the fields a customer needs to pick a service are returned; sheetRow,
// sortOrder, and active are internal/admin bookkeeping.
export async function GET() {
  try {
    const services = await fetchExtraServices();
    const active = services
      .filter((service) => service.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ id, name, description, imageUrl }) => ({ id, name, description, imageUrl }));

    return NextResponse.json({ success: true, services: active });
  } catch (err) {
    console.error("[customer-portal/extra-services GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load services.", services: [] },
      { status: 500 }
    );
  }
}
