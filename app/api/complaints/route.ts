import { NextResponse } from "next/server";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

export async function GET() {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const response = await fetch(`${SCRIPT_URL}?action=getComplaints`, {
      method: "GET",
      cache: "no-store",
    });

    const text = await response.text();

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while loading complaints.",
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to load complaints from Google Script.",
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      complaints: data.complaints || data.data || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error loading complaints.",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    const body = await request.json();

    const complaint = body.complaint || body;

    const payload = {
      action: "addComplaint",
      complaint: {
        accountId: complaint.accountId || complaint["Account ID"] || "",
        accountName: complaint.accountName || complaint["Account Name"] || "",

        date:
          complaint.date ||
          complaint.complaintDate ||
          complaint["Complaint Date"] ||
          "",

        complaintDate:
          complaint.complaintDate ||
          complaint.date ||
          complaint["Complaint Date"] ||
          "",

        complaintType:
          complaint.complaintType ||
          complaint.issueType ||
          complaint.type ||
          complaint.issue ||
          complaint.Issue ||
          "",

        issue: complaint.issue || complaint.Issue || complaint.description || "",
        description: complaint.description || complaint.issue || complaint.Issue || "",

        priority: complaint.priority || complaint.Priority || complaint.severity || "Medium",
        severity: complaint.severity || complaint.priority || complaint.Priority || "Medium",

        status: complaint.status || complaint.Status || "Open",

        complaintValidity:
          complaint.complaintValidity ||
          complaint.validity ||
          complaint["Complaint Validity"] ||
          "Needs Review",

        validity:
          complaint.complaintValidity ||
          complaint.validity ||
          complaint["Complaint Validity"] ||
          "Needs Review",

        manager:
          complaint.manager ||
          complaint.assignedTo ||
          complaint["Assigned To"] ||
          "",

        assignedTo:
          complaint.assignedTo ||
          complaint.manager ||
          complaint["Assigned To"] ||
          "",

        subcontractor: complaint.subcontractor || complaint.Subcontractor || "",

        resolution: complaint.resolution || complaint.Resolution || "",

        followUpDate:
          complaint.followUpDate ||
          complaint.lastFollowUp ||
          complaint["Last Follow-Up"] ||
          complaint["Follow Up Date"] ||
          "",

        lastFollowUp:
          complaint.lastFollowUp ||
          complaint.followUpDate ||
          complaint["Last Follow-Up"] ||
          "",

        notes: complaint.notes || complaint.Notes || "",
        reportedBy: complaint.reportedBy || complaint["Reported By"] || "",

        "Account ID": complaint.accountId || complaint["Account ID"] || "",
        "Account Name": complaint.accountName || complaint["Account Name"] || "",
        "Complaint Date":
          complaint.complaintDate ||
          complaint.date ||
          complaint["Complaint Date"] ||
          "",
        Issue: complaint.issue || complaint.Issue || complaint.description || "",
        Priority: complaint.priority || complaint.Priority || complaint.severity || "Medium",
        Status: complaint.status || complaint.Status || "Open",
        "Complaint Validity":
          complaint.complaintValidity ||
          complaint.validity ||
          complaint["Complaint Validity"] ||
          "Needs Review",
        "Reported By": complaint.reportedBy || complaint["Reported By"] || "",
        "Assigned To":
          complaint.assignedTo ||
          complaint.manager ||
          complaint["Assigned To"] ||
          "",
        "Last Follow-Up":
          complaint.lastFollowUp ||
          complaint.followUpDate ||
          complaint["Last Follow-Up"] ||
          "",
        Notes: complaint.notes || complaint.Notes || "",
      },
    };

    console.log("Saving complaint payload:", payload);

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await response.text();

    let data: any;

    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error:
            "Google Script did not return valid JSON while saving complaint.",
          sentPayload: payload,
          rawResponse: text,
        },
        { status: 500 }
      );
    }

    if (!response.ok || data.success === false) {
      return NextResponse.json(
        {
          success: false,
          error: data.error || "Failed to save complaint to Google Script.",
          sentPayload: payload,
          rawResponse: data,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      id: data.id || "",
      rowNumber: data.rowNumber || "",
      message: data.message || "Complaint saved successfully.",
      sentPayload: payload,
      scriptResponse: data,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error saving complaint.",
      },
      { status: 500 }
    );
  }
}