import { NextRequest, NextResponse } from "next/server";
import {
  getExtraServiceById,
  updateExtraService,
  type ExtraServiceUpdateInput,
} from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

function errorStatus(err: unknown): number {
  return err instanceof Error && err.message.includes("not found") ? 404 : 500;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const service = await getExtraServiceById(id);

    if (!service) {
      return NextResponse.json(
        { success: false, error: "Extra service not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, service });
  } catch (err) {
    console.error("[extra-services/[id] GET]", err);
    return NextResponse.json(
      { success: false, error: "Failed to load extra service." },
      { status: 500 }
    );
  }
}

async function handleUpdate(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      name?: string;
      description?: string;
      imageUrl?: string;
      active?: boolean;
      sortOrder?: number;
    };

    const fields: ExtraServiceUpdateInput = {};
    if (body.name !== undefined) fields.name = body.name.trim();
    if (body.description !== undefined) fields.description = body.description.trim();
    if (body.imageUrl !== undefined) fields.imageUrl = body.imageUrl.trim();
    if (body.active !== undefined) fields.active = body.active;
    if (body.sortOrder !== undefined) fields.sortOrder = Number(body.sortOrder) || 0;

    await updateExtraService(id, fields);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[extra-services/[id] update]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update extra service." },
      { status: errorStatus(err) }
    );
  }
}

export const PUT = handleUpdate;
export const PATCH = handleUpdate;

// Soft-delete: sets active=No instead of removing the row. Matches this
// app's pattern for persistent catalog/config data (e.g. Managers, which
// also has no hard-delete) — hiding a service from the portal shouldn't
// destroy admin-entered content (name/description/image) that might need
// to be restored later.
export async function DELETE(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    await updateExtraService(id, { active: false });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[extra-services/[id] DELETE]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to delete extra service." },
      { status: errorStatus(err) }
    );
  }
}
