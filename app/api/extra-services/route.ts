import { NextRequest, NextResponse } from "next/server";
import { appendExtraService, fetchExtraServices } from "@/lib/googleSheets";

// ?activeOnly=true restricts the list to services with active=Yes — for the
// customer-portal-facing picker (Phase 3), which should never show a
// service an admin has hidden. Admin Settings (Phase 2) omits the param to
// see everything, including hidden services.
export async function GET(request: NextRequest) {
  try {
    const activeOnly = request.nextUrl.searchParams.get("activeOnly") === "true";
    const services = await fetchExtraServices();
    const filtered = activeOnly ? services.filter((s) => s.active) : services;
    const sorted = [...filtered].sort((a, b) => a.sortOrder - b.sortOrder);

    return NextResponse.json({ success: true, services: sorted });
  } catch (err) {
    console.error("[extra-services GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load extra services." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      imageUrl?: string;
      active?: boolean;
      sortOrder?: number;
    };

    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required." },
        { status: 400 }
      );
    }

    const id = await appendExtraService({
      name,
      description: body.description?.trim() ?? "",
      imageUrl: body.imageUrl?.trim() ?? "",
      active: body.active ?? true,
      sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    console.error("[extra-services POST]", err);
    return NextResponse.json(
      { success: false, error: "Failed to create extra service." },
      { status: 500 }
    );
  }
}
