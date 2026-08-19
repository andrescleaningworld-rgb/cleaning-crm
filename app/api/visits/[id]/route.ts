import { NextRequest, NextResponse } from "next/server";
import {
  getManagerVisitById,
  updateManagerVisit,
  fetchVisitEditLog,
  appendVisitEditLog,
  type ManagerVisit,
  type ManagerVisitUpdateInput,
} from "@/lib/googleSheets";

type RouteContext = { params: Promise<{ id: string }> };

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function errorStatus(err: unknown): number {
  return err instanceof Error && err.message.includes("not found") ? 404 : 500;
}

const CHANGE_FIELDS: { key: keyof ManagerVisitUpdateInput; label: string }[] = [
  { key: "date", label: "Date" },
  { key: "visitType", label: "Visit Type" },
  { key: "completedBy", label: "Completed By" },
  { key: "condition", label: "Condition" },
  { key: "followUpNeeded", label: "Follow-Up" },
  { key: "followUpDate", label: "Follow-Up Date" },
];

// Brief, human-readable diff for the VisitEditLog row — not a full audit
// trail, just enough to be useful at a glance (e.g. "Condition: 8 -> 6,
// Notes updated").
function buildChangeSummary(before: ManagerVisit, after: ManagerVisit): string {
  const parts: string[] = [];
  for (const { key, label } of CHANGE_FIELDS) {
    const beforeValue = clean(before[key]);
    const afterValue = clean(after[key]);
    if (beforeValue !== afterValue) {
      parts.push(`${label}: ${beforeValue || "—"} -> ${afterValue || "—"}`);
    }
  }
  if (clean(before.notes) !== clean(after.notes)) parts.push("Notes updated");
  return parts.join(", ") || "No changes";
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const visit = await getManagerVisitById(id);

    if (!visit) {
      return NextResponse.json({ success: false, error: "Visit not found." }, { status: 404 });
    }

    const editHistory = await fetchVisitEditLog(id);

    return NextResponse.json({ success: true, visit, editHistory });
  } catch (err) {
    console.error("[visits/[id] GET]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load visit." },
      { status: 500 }
    );
  }
}

async function handleUpdate(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const body = (await request.json()) as {
      date?: string;
      visitType?: string;
      completedBy?: string;
      condition?: string;
      followUpNeeded?: string;
      followUpDate?: string;
      notes?: string;
      editedBy?: string;
    };

    const editedBy = clean(body.editedBy);
    if (!editedBy) {
      return NextResponse.json(
        { success: false, error: "Missing editor name." },
        { status: 400 }
      );
    }

    const before = await getManagerVisitById(id);
    if (!before) {
      return NextResponse.json({ success: false, error: "Visit not found." }, { status: 404 });
    }

    const fields: ManagerVisitUpdateInput = {};
    if (body.date !== undefined) fields.date = clean(body.date);
    if (body.visitType !== undefined) fields.visitType = clean(body.visitType);
    if (body.completedBy !== undefined) fields.completedBy = clean(body.completedBy);
    if (body.condition !== undefined) fields.condition = clean(body.condition);
    if (body.followUpNeeded !== undefined) fields.followUpNeeded = clean(body.followUpNeeded);
    if (body.followUpDate !== undefined) fields.followUpDate = clean(body.followUpDate);
    if (body.notes !== undefined) fields.notes = clean(body.notes);

    const after = await updateManagerVisit(id, fields);
    const changeSummary = buildChangeSummary(before, after);

    // Best-effort: the edit already succeeded, so a logging failure
    // shouldn't turn this into a reported failure.
    try {
      await appendVisitEditLog({ visitId: id, editedBy, changeSummary });
    } catch (err) {
      console.error("[visits/[id] update] logging edit failed", err);
    }

    return NextResponse.json({ success: true, visit: after });
  } catch (err) {
    console.error("[visits/[id] update]", err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update visit." },
      { status: errorStatus(err) }
    );
  }
}

export const PUT = handleUpdate;
export const PATCH = handleUpdate;
