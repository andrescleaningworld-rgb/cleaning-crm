import { NextResponse } from "next/server";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

type ScriptResponse = {
  success?: boolean;
  error?: string;
  message?: string;
  id?: string;
  rowNumber?: string | number;
  status?: string;
  complaints?: unknown[];
  data?: unknown[];
};

type ComplaintPayload = {
  rowNumber?: string | number;
  id?: string;
  complaintId?: string;
  accountId?: string;
  accountName?: string;
  date?: string;
  complaintDate?: string;
  complaintType?: string;
  issueType?: string;
  type?: string;
  issue?: string;
  Issue?: string;
  description?: string;
  priority?: string;
  Priority?: string;
  severity?: string;
  status?: string;
  Status?: string;
  complaintValidity?: string;
  validity?: string;
  manager?: string;
  assignedTo?: string;
  subcontractor?: string;
  Subcontractor?: string;
  resolution?: string;
  Resolution?: string;
  resolutionNotes?: string;
  followUpDate?: string;
  lastFollowUp?: string;
  closedDate?: string;
  notes?: string;
  Notes?: string;
  reportedBy?: string;
  [key: string]: unknown;
};

type RequestBody = {
  action?: string;
  complaint?: ComplaintPayload;
  rowNumber?: string | number;
  id?: string;
} & ComplaintPayload;

function clean(value: unknown): string {
  return String(value ?? "").trim();
}

function getText(row: ComplaintPayload, key: string): string {
  return clean(row[key]);
}

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

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
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

    return NextResponse.json(
      {
        success: true,
        complaints: Array.isArray(data.complaints)
          ? data.complaints
          : Array.isArray(data.data)
            ? data.data
            : [],
      },
      {
        headers: {
          "Cache-Control": "public, max-age=20, stale-while-revalidate=40",
        },
      }
    );
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

    const body = (await request.json()) as RequestBody;

    const requestedAction = clean(body.action) || "addComplaint";
    const complaint: ComplaintPayload = body.complaint || body;

    const isClosingComplaint =
      requestedAction === "closeComplaint" ||
      requestedAction === "updateComplaint" ||
      requestedAction === "resolveComplaint";

    if (isClosingComplaint) {
      const payload = {
        action: "closeComplaint",
        complaint: {
          rowNumber: complaint.rowNumber || body.rowNumber || "",
          id: clean(complaint.id || complaint.complaintId || body.id),
          accountName: clean(
            complaint.accountName || getText(complaint, "Account Name")
          ),
          date: clean(
            complaint.date ||
              complaint.complaintDate ||
              getText(complaint, "Complaint Date")
          ),
          description: clean(
            complaint.description || complaint.issue || complaint.Issue
          ),
          issue: clean(complaint.issue || complaint.description || complaint.Issue),
          status: clean(complaint.status) || "Closed",
          resolution: clean(
            complaint.resolution || complaint.resolutionNotes || complaint.notes
          ),
          resolutionNotes: clean(
            complaint.resolutionNotes || complaint.resolution || complaint.notes
          ),
          followUpDate:
            clean(complaint.followUpDate || complaint.closedDate) ||
            new Date().toISOString().slice(0, 10),
          closedDate:
            clean(complaint.closedDate || complaint.followUpDate) ||
            new Date().toISOString().slice(0, 10),
          notes: clean(complaint.notes),
        },
      };

      const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(payload),
        cache: "no-store",
      });

      const text = await response.text();

      let data: ScriptResponse;

      try {
        data = JSON.parse(text) as ScriptResponse;
      } catch {
        return NextResponse.json(
          {
            success: false,
            error:
              "Google Script did not return valid JSON while closing complaint.",
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
            error: data.error || "Failed to close complaint in Google Script.",
            sentPayload: payload,
            rawResponse: data,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        rowNumber: data.rowNumber || payload.complaint.rowNumber || "",
        status: data.status || "Closed",
        message: data.message || "Complaint closed successfully.",
        scriptResponse: data,
      });
    }

    const payload = {
      action: "addComplaint",
      complaint: {
        accountId: clean(
          complaint.accountId || getText(complaint, "Account ID")
        ),
        accountName: clean(
          complaint.accountName || getText(complaint, "Account Name")
        ),

        date: clean(
          complaint.date ||
            complaint.complaintDate ||
            getText(complaint, "Complaint Date")
        ),

        complaintDate: clean(
          complaint.complaintDate ||
            complaint.date ||
            getText(complaint, "Complaint Date")
        ),

        complaintType: clean(
          complaint.complaintType ||
            complaint.issueType ||
            complaint.type ||
            complaint.issue ||
            complaint.Issue
        ),

        issue: clean(complaint.issue || complaint.Issue || complaint.description),
        description: clean(complaint.description || complaint.issue || complaint.Issue),

        priority:
          clean(complaint.priority || complaint.Priority || complaint.severity) ||
          "Medium",

        severity:
          clean(complaint.severity || complaint.priority || complaint.Priority) ||
          "Medium",

        status: clean(complaint.status || complaint.Status) || "Open",

        complaintValidity:
          clean(
            complaint.complaintValidity ||
              complaint.validity ||
              getText(complaint, "Complaint Validity")
          ) || "Needs Review",

        validity:
          clean(
            complaint.complaintValidity ||
              complaint.validity ||
              getText(complaint, "Complaint Validity")
          ) || "Needs Review",

        manager: clean(
          complaint.manager || complaint.assignedTo || getText(complaint, "Assigned To")
        ),

        assignedTo: clean(
          complaint.assignedTo || complaint.manager || getText(complaint, "Assigned To")
        ),

        subcontractor: clean(complaint.subcontractor || complaint.Subcontractor),

        resolution: clean(complaint.resolution || complaint.Resolution),

        followUpDate: clean(
          complaint.followUpDate ||
            complaint.lastFollowUp ||
            getText(complaint, "Last Follow-Up") ||
            getText(complaint, "Follow Up Date")
        ),

        lastFollowUp: clean(
          complaint.lastFollowUp ||
            complaint.followUpDate ||
            getText(complaint, "Last Follow-Up")
        ),

        notes: clean(complaint.notes || complaint.Notes),
        reportedBy: clean(complaint.reportedBy || getText(complaint, "Reported By")),

        "Account ID": clean(
          complaint.accountId || getText(complaint, "Account ID")
        ),
        "Account Name": clean(
          complaint.accountName || getText(complaint, "Account Name")
        ),
        "Complaint Date": clean(
          complaint.complaintDate ||
            complaint.date ||
            getText(complaint, "Complaint Date")
        ),
        Issue: clean(complaint.issue || complaint.Issue || complaint.description),
        Priority:
          clean(complaint.priority || complaint.Priority || complaint.severity) ||
          "Medium",
        Status: clean(complaint.status || complaint.Status) || "Open",
        "Complaint Validity":
          clean(
            complaint.complaintValidity ||
              complaint.validity ||
              getText(complaint, "Complaint Validity")
          ) || "Needs Review",
        "Reported By": clean(complaint.reportedBy || getText(complaint, "Reported By")),
        "Assigned To": clean(
          complaint.assignedTo || complaint.manager || getText(complaint, "Assigned To")
        ),
        "Last Follow-Up": clean(
          complaint.lastFollowUp ||
            complaint.followUpDate ||
            getText(complaint, "Last Follow-Up")
        ),
        Notes: clean(complaint.notes || complaint.Notes),
      },
    };

    const response = await fetch(SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    const text = await response.text();

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
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