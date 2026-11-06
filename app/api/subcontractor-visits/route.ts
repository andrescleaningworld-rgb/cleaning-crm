import { filesJson } from "@/lib/files";
import { NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import { subSessionOptions, type SubSessionData } from "@/lib/subSession";
import { logSubcontractorVisit, getSubcontractorVisits } from "@/lib/data/scheduling";

export async function GET(request: NextRequest) {
  const session = await getIronSession<SubSessionData>(await cookies(), subSessionOptions());
  if (!session.subcontractorEmail) {
    return filesJson({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const account = searchParams.get("account")?.trim();

  try {
    const visits = await getSubcontractorVisits(session.subcontractorEmail, account ?? undefined);
    return filesJson({ visits });
  } catch (err) {
    console.error("[subcontractor-visits GET]", err);
    return filesJson({ error: "Failed to load visits" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await getIronSession<SubSessionData>(await cookies(), subSessionOptions());
  if (!session.subcontractorEmail) {
    return filesJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    accountName?: string;
    visitDate?: string;
    arrivalTime?: string;
    notes?: string;
  };

  try {
    body = await request.json();
  } catch {
    return filesJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const { accountName, visitDate, arrivalTime, notes } = body;

  if (!accountName?.trim() || !visitDate?.trim() || !arrivalTime?.trim()) {
    return filesJson({ error: "accountName, visitDate, and arrivalTime are required" }, { status: 400 });
  }

  // Reject future dates
  const todayStr = new Date().toISOString().slice(0, 10);
  if (visitDate.trim() > todayStr) {
    return filesJson({ error: "Cannot log visits for future dates" }, { status: 400 });
  }

  try {
    const visitId = await logSubcontractorVisit({
      accountName: accountName.trim(),
      subEmail: session.subcontractorEmail,
      subName: session.subcontractorName?.trim() ?? "",
      visitDate: visitDate.trim(),
      arrivalTime: arrivalTime.trim(),
      notes: notes?.trim() ?? "",
    });
    return filesJson({ success: true, visitId });
  } catch (err) {
    console.error("[subcontractor-visits POST]", err);
    return filesJson({ error: "Failed to log visit" }, { status: 500 });
  }
}
