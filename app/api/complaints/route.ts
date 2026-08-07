import { after, NextResponse } from "next/server";
import { findSubcontractorPhoneByName } from "@/app/api/subcontractors/route";
import { sanitizeSmsText, sendSms } from "@/lib/sms";
import { appendComplaint } from "@/lib/googleSheets";

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
  notification?: {
    sent?: boolean;
    reason?: string;
  };
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

    if (requestedAction === "resendComplaintNotification") {
      const payload = {
        action: "resendComplaintNotification",
        complaint: {
          rowNumber: complaint.rowNumber || body.rowNumber || "",
          id: clean(complaint.id || complaint.complaintId || body.id),
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
              "Google Script did not return valid JSON while resending the subcontractor email.",
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
            error: data.error || "Failed to resend subcontractor email.",
            sentPayload: payload,
            rawResponse: data,
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        notification: data.notification || undefined,
        message: data.message || "Resend attempted.",
        scriptResponse: data,
      });
    }

    // Creation writes directly to the Complaints tab via the Sheets API
    // (see appendComplaint in lib/googleSheets.ts) instead of forwarding to
    // the Apps Script backend — that handler was silently dropping
    // "Reported By" before it reached the sheet. Close/edit/resend actions
    // above are untouched and still go through Apps Script.
    const fields = {
      accountId: clean(
        complaint.accountId || getText(complaint, "Account ID")
      ),
      accountName: clean(
        complaint.accountName || getText(complaint, "Account Name")
      ),
      complaintDate: clean(
        complaint.complaintDate ||
          complaint.date ||
          getText(complaint, "Complaint Date")
      ),
      issue: clean(complaint.issue || complaint.Issue || complaint.description),
      priority:
        clean(complaint.priority || complaint.Priority || complaint.severity) ||
        "Medium",
      status: clean(complaint.status || complaint.Status) || "Open",
      complaintValidity:
        clean(
          complaint.complaintValidity ||
            complaint.validity ||
            getText(complaint, "Complaint Validity")
        ) || "Needs Review",
      reportedBy: clean(complaint.reportedBy || getText(complaint, "Reported By")),
      assignedTo: clean(
        complaint.assignedTo || complaint.manager || getText(complaint, "Assigned To")
      ),
      lastFollowUpDate: clean(
        complaint.lastFollowUp ||
          complaint.followUpDate ||
          getText(complaint, "Last Follow-Up")
      ),
      notes: clean(complaint.notes || complaint.Notes),
      // Not a sheet column — only used below to trigger the subcontractor
      // SMS, same as before the migration.
      subcontractor: clean(complaint.subcontractor || complaint.Subcontractor),
    };

    let complaintId: string;

    try {
      complaintId = await appendComplaint(fields);
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to save complaint to Google Sheets.",
        },
        { status: 500 }
      );
    }

    // Only fires on a fresh addComplaint — this route has no "reassign
    // subcontractor on an existing complaint" action to hook. Wrapped in
    // after() so the invocation stays alive until the lookup + send
    // actually finish, instead of racing a fire-and-forget chain against
    // the instance freezing post-response — see notifyManagerOfNewToDo's
    // comment in app/api/to-do/route.ts for why that matters. Body is
    // title / description / deep link to the complaint's detail page, sent
    // unsanitized-for-length via sanitizeSmsText(..., Infinity).
    if (fields.subcontractor) {
      const subcontractorName = fields.subcontractor;
      const summary = fields.issue || fields.accountName;
      const origin = new URL(request.url).origin;

      after(async () => {
        try {
          const phone = await findSubcontractorPhoneByName(subcontractorName);
          if (!phone) {
            console.debug(
              `[sms] skip complaint-assignment notify: no phone on file for subcontractor "${subcontractorName}"`
            );
            return;
          }
          const link = `${origin}/complaints/${encodeURIComponent(complaintId)}`;
          const rawMessage = [
            `New complaint: ${fields.accountName || "Account"}`,
            summary,
            link,
          ]
            .filter(Boolean)
            .join("\n");
          const message = sanitizeSmsText(rawMessage, Infinity);
          await sendSms(phone, message, "complaints/addComplaint");
        } catch (error) {
          console.error(
            "[sms] complaint-assignment notify lookup failed:",
            error instanceof Error ? error.message : error
          );
        }
      });
    }

    return NextResponse.json({
      success: true,
      id: complaintId,
      rowNumber: "",
      message: "Complaint saved successfully.",
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