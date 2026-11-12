import { after, NextRequest, NextResponse } from "next/server";
import {
  appendComplaint,
  closeComplaint,
  complaintsOnPostgres,
  editComplaint,
  getComplaintsAppsScriptShape,
} from "@/lib/data/complaints";
import { sendInternalNotification } from "@/lib/email";
import { notifySubOfComplaint } from "@/lib/complaintSubNotice";
import { mergeComplaints } from "@/lib/pg/complaint-changes";
import { markFirstResponse } from "@/lib/pg/complaint-response";
import { addComplaintEvent, complaintRowId } from "@/lib/pg/complaint-events";
import { afterPhotos, isResolvedStatus, needsFixProof, recordFix } from "@/lib/pg/complaint-fix";
import { complaintTrackById } from "@/lib/pg/complaint-track";
import { fixPhotoLinks } from "@/lib/complaintFixPhotos";
import { sendCustomerFixedEmail } from "@/lib/complaintCustomerEmail";
import { fetchAppsScript, AppsScriptFetchError } from "@/lib/appsScriptFetch";
import { getAdminIdentity } from "@/lib/adminSession";
import { logActivity } from "@/lib/activityLog";

const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// Apps Script latency has been measured spiking to ~14s on a single call;
// this must comfortably exceed the per-attempt timeout in fetchAppsScript
// (18s) plus its one retry plus backoff, or Vercel would kill the function
// before our own retry/error-handling logic gets a chance to run. Matches
// the budget used by /api/accounts and /api/subcontractor-portal for the
// same upstream. Only the GET (with DATA_SOURCE_COMPLAINTS off) still calls
// Apps Script; every save is in Postgres.
export const maxDuration = 45;

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

const LIST_HEADERS = { "Cache-Control": "public, max-age=20, stale-while-revalidate=40" };

export async function GET() {
  try {
    // DATA_SOURCE_COMPLAINTS=postgres: the same list, in the same shape,
    // without Apps Script.
    if (complaintsOnPostgres()) {
      return NextResponse.json({ success: true, complaints: await getComplaintsAppsScriptShape() }, { headers: LIST_HEADERS });
    }

    if (!SCRIPT_URL) {
      return NextResponse.json(
        {
          success: false,
          error: "Missing GOOGLE_SCRIPT_URL in .env.local",
        },
        { status: 500 }
      );
    }

    let response: Response;
    try {
      // Read-only action — safe to retry after a throw (timeout/network
      // failure), unlike the write branches in POST below.
      response = await fetchAppsScript(
        `${SCRIPT_URL}?action=getComplaints`,
        { method: "GET", cache: "no-store" },
        undefined,
        { retryOn5xx: true, retryOnThrow: true }
      );
    } catch (error) {
      if (error instanceof AppsScriptFetchError) {
        console.error("[complaints] Apps Script call failed:", error.message);
        return NextResponse.json(
          { success: false, error: error.message },
          { status: error.status }
        );
      }
      throw error;
    }

    const text = await response.text();

    let data: ScriptResponse;

    try {
      data = JSON.parse(text) as ScriptResponse;
    } catch {
      console.error(
        `[complaints] Apps Script did not return valid JSON (status=${response.status}):`,
        text.slice(0, 500)
      );
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
      console.error(
        `[complaints] Apps Script returned a failure (status=${response.status}):`,
        data.error || data
      );
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
      { headers: LIST_HEADERS }
    );
  } catch (error) {
    console.error(
      "[complaints] unexpected error loading complaints:",
      error instanceof Error ? error.message : error
    );
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

export async function POST(request: NextRequest) {
  try {
    // Complaints are saved in Postgres only. The old Google Sheets saves
    // (Apps Script closeComplaint, the Sheets API append) were removed on
    // Nov 6, 2026: with DATA_SOURCE_COMPLAINTS off, saving refuses.
    if (!complaintsOnPostgres()) {
      return NextResponse.json(
        { success: false, error: "Complaints can only be saved in the database (DATA_SOURCE_COMPLAINTS=postgres). Saving to Google Sheets was removed." },
        { status: 503 }
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

      // Proof of fix (lib/pg/complaint-fix.ts): at least one after photo, or
      // "No photo needed" and why. Checked before anything is saved.
      const fixKey = clean(payload.complaint.id) || clean(payload.complaint.rowNumber);
      const fixRowId = fixKey ? await complaintRowId(fixKey) : null;
      const fixPhotos = fixPhotoLinks(fixKey, (body as { fixPhotos?: unknown }).fixPhotos ?? complaint.fixPhotos);
      const noPhotoReason = clean((body as { noPhotoReason?: unknown }).noPhotoReason ?? complaint.noPhotoReason).slice(0, 300);
      if (fixRowId !== null && isResolvedStatus(payload.complaint.status) && fixPhotos.length === 0 && !noPhotoReason && (await needsFixProof(fixRowId))) {
        return NextResponse.json({ success: false, error: "Add an after photo, or tap “No photo needed” and say why. Nothing was saved." }, { status: 400 });
      }

      // Closed in Postgres, same answer shape as before.
      {
        let closed: { rowNumber: number; status: string };
        try {
          closed = await closeComplaint({
            rowNumber: payload.complaint.rowNumber,
            id: payload.complaint.id,
            status: payload.complaint.status,
            resolution: payload.complaint.resolution,
          });
        } catch (error) {
          return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : "Failed to close complaint.", sentPayload: payload },
            { status: 500 }
          );
        }

        const actor = await getAdminIdentity(request);
        if (actor?.accountId) {
          await logActivity({
            actorAccountId: actor.accountId,
            actorRole: actor.role ?? "manager",
            actorName: actor.name || "",
            action: "update",
            entityType: "complaint",
            entityId: String(closed.rowNumber),
          });
        }
        // Closing it answers it (the response clock stops, if it was still running).
        await markFirstResponse(String(closed.rowNumber), actor?.name || "Staff");
        // The proof, on the complaint (before / after on its page).
        if (fixRowId !== null) await recordFix({ rowId: fixRowId, photos: fixPhotos, noPhotoReason, by: actor?.name || "Staff" });
        // "Close & send to customer" (the review on the Complaint page): what the
        // customer sees (the edited note, the photos not hidden) is kept on the
        // complaint, and the "It's fixed" email goes now, whatever the Settings
        // switch: the button is the approval. Not for a complaint hidden from the customer.
        if (fixRowId !== null && isResolvedStatus(closed.status) && (body as { sendToCustomer?: unknown }).sendToCustomer === true) {
          const extra = body as { customerNote?: unknown; hidePhotos?: unknown };
          const bare = (url: unknown) => clean(url).split("?")[0];
          const hide = new Set((Array.isArray(extra.hidePhotos) ? extra.hidePhotos : []).map(bare));
          const visible = fixPhotoLinks(fixKey, (await afterPhotos(fixRowId)).filter((url) => !hide.has(bare(url))));
          const note = clean(extra.customerNote).slice(0, 2000);
          const track = await complaintTrackById(fixRowId).catch(() => null);
          let customerEmail: "sent" | "failed" | "skipped" = "skipped";
          if (!track?.hidden) {
            await addComplaintEvent({ complaintId: fixRowId, kind: "customer_fix", detail: note, photos: visible, by: actor?.name || "Staff" });
            customerEmail = await sendCustomerFixedEmail(fixRowId, new URL(request.url).origin, { force: true, note, photos: visible }).catch((error) => {
              console.error("[complaints close] customer email:", error instanceof Error ? error.message : error);
              return "failed" as const;
            });
          }
          return NextResponse.json({
            success: true,
            rowNumber: closed.rowNumber,
            status: closed.status,
            customerEmail,
            hidden: Boolean(track?.hidden),
            message: "Complaint closed successfully.",
          });
        }
        // A customer's portal complaint: "It's fixed" email (only while the switch is on; lib/complaintCustomerEmail.ts).
        if (fixRowId !== null && isResolvedStatus(closed.status)) {
          const origin = new URL(request.url).origin;
          after(() => sendCustomerFixedEmail(fixRowId, origin).catch((error) => console.error("[complaints close] customer email:", error instanceof Error ? error.message : error)));
        }

        return NextResponse.json({
          success: true,
          rowNumber: closed.rowNumber,
          status: closed.status,
          message: "Complaint closed successfully.",
          scriptResponse: { success: true, rowNumber: closed.rowNumber, status: closed.status },
        });
      }
    }

    // "Edit what the customer sees" (Complaint Detail page, a closed complaint):
    // new wording for the "How we fixed it" note (the team's words, or a
    // mistake) and which after photos show. Kept as a new 'customer_fix'
    // event (the latest one counts, channel "edit" so the Fixed date stays).
    // No email goes to the customer.
    if (requestedAction === "editCustomerFix") {
      const actor = await getAdminIdentity(request);
      if (!actor) return NextResponse.json({ success: false, error: "Log in first. Nothing was saved." }, { status: 401 });
      const key = clean(complaint.id || complaint.complaintId || body.id) || clean(complaint.rowNumber || body.rowNumber);
      const rowId = key ? await complaintRowId(key) : null;
      if (rowId === null) return NextResponse.json({ success: false, error: "Complaint not found." }, { status: 404 });
      const track = await complaintTrackById(rowId).catch(() => null);
      if (track?.view?.step !== "fixed") return NextResponse.json({ success: false, error: "Only a closed complaint has this. Close it first." }, { status: 400 });
      const extra = body as { customerNote?: unknown; hidePhotos?: unknown };
      const bare = (url: unknown) => clean(url).split("?")[0];
      const hide = new Set((Array.isArray(extra.hidePhotos) ? extra.hidePhotos : []).map(bare));
      const visible = fixPhotoLinks(key, track.fixPhotos.filter((url) => !hide.has(bare(url))));
      const note = clean(extra.customerNote).slice(0, 2000);
      await addComplaintEvent({ complaintId: rowId, kind: "customer_fix", channel: "edit", detail: note, photos: visible, by: actor.name || "Staff" });
      return NextResponse.json({ success: true, message: "Saved. The customer sees the new wording. No email was sent." });
    }

    // "Hide from customer" / "Show to customer" (Complaint Detail page): whether
    // this complaint and its progress show on the customer's portal. Kept as a
    // complaint event (the latest one counts); nothing else changes.
    if (requestedAction === "customerVisibility") {
      const actor = await getAdminIdentity(request);
      if (!actor) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
      const key = clean(complaint.id || complaint.complaintId || body.id) || clean(complaint.rowNumber || body.rowNumber);
      const rowId = key ? await complaintRowId(key) : null;
      if (rowId === null) return NextResponse.json({ success: false, error: "Complaint not found." }, { status: 404 });
      const hidden = (body as { hidden?: unknown }).hidden === true;
      await addComplaintEvent({ complaintId: rowId, kind: "customer_visibility", channel: hidden ? "hidden" : "shown", detail: hidden ? "Hidden from the customer." : "Shown to the customer.", by: actor.name || "Staff" });
      return NextResponse.json({ success: true, hidden, message: hidden ? "Hidden from the customer." : "The customer sees it." });
    }

    // "Got it" (Complaint Detail page): a manager answers the complaint without
    // changing anything else. Stops the response clock (lib/pg/complaint-response.ts).
    if (requestedAction === "acknowledge") {
      const actor = await getAdminIdentity(request);
      if (!actor) return NextResponse.json({ success: false, error: "Log in first." }, { status: 401 });
      const key = clean(complaint.id || complaint.complaintId || body.id) || clean(complaint.rowNumber || body.rowNumber);
      const rowId = key ? await complaintRowId(key) : null;
      if (rowId === null) return NextResponse.json({ success: false, error: "Complaint not found." }, { status: 404 });
      const first = await markFirstResponse(rowId, actor.name || "Staff");
      await addComplaintEvent({ complaintId: rowId, kind: "acknowledged", detail: first ? "Got it (first answer)." : "Got it.", by: actor.name || "Staff" });
      return NextResponse.json({ success: true, first, message: "Got it." });
    }

    // "Notify sub" (Complaint Detail page, Pin Board popup): the same email +
    // text a new complaint sends, by hand, any time (lib/complaintSubNotice.ts).
    // "resendComplaintNotification" is the old name of the same button.
    if (requestedAction === "notifySub" || requestedAction === "resendComplaintNotification") {
      const actor = await getAdminIdentity(request);
      if (!actor) return NextResponse.json({ success: false, error: "Log in first. Nothing was sent." }, { status: 401 });
      const key = clean(complaint.id || complaint.complaintId || body.id) || clean(complaint.rowNumber || body.rowNumber);
      if (!key) return NextResponse.json({ success: false, error: "Which complaint? Reload the page." }, { status: 400 });
      try {
        const result = await notifySubOfComplaint({ key, origin: new URL(request.url).origin, by: actor.name || "Staff" });
        const sentSomething = result.email === "sent" || result.text === "sent";
        return NextResponse.json({
          success: true,
          result,
          notification: { sent: sentSomething, reason: sentSomething ? "" : result.reasons.join(" ") },
          message: sentSomething ? "Sub notified." : "Not sent.",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The notice was not sent.";
        console.error("[complaints notifySub]", message);
        return NextResponse.json({ success: false, error: message }, { status: message === "Complaint not found." ? 404 : 500 });
      }
    }

    // "Merge into another complaint" (Complaint Detail page): same account
    // only. The text and photos move into the main one; this one is closed as
    // "Merged" and never counts (lib/pg/complaint-changes.ts).
    if (requestedAction === "mergeComplaint") {
      const actor = await getAdminIdentity(request);
      if (!actor) return NextResponse.json({ success: false, error: "Log in first. Nothing was merged." }, { status: 401 });
      const fromKey = clean(body.from || complaint.id || complaint.complaintId);
      const intoKey = clean(body.into);
      if (!fromKey || !intoKey) return NextResponse.json({ success: false, error: "Pick the complaint to merge into." }, { status: 400 });
      try {
        const merged = await mergeComplaints({ fromKey, intoKey, by: actor.name || "Staff" });
        for (const [entityId, detail] of [
          [merged.fromId, `Complaint merged into ${merged.intoId}`],
          [merged.intoId, `Complaint ${merged.fromId} merged into this one`],
        ]) {
          await logActivity({
            actorAccountId: actor.accountId ?? null,
            actorRole: actor.role ?? "manager",
            actorName: actor.name || "",
            action: "update",
            entityType: "complaint",
            entityId,
            detail,
          }).catch(() => null);
        }
        return NextResponse.json({ success: true, intoKey: merged.intoKey, message: "Merged." });
      } catch (error) {
        const message = error instanceof Error ? error.message : "The complaints were not merged.";
        console.error("[complaints mergeComplaint]", message);
        return NextResponse.json({ success: false, error: message }, { status: 400 });
      }
    }

    // The complaint page's Edit -> Save: the SAME complaint is updated (same
    // number). Never a new complaint, and nothing is sent to the office or
    // the sub. Before, this request fell through to "create" below, so every
    // Save made a copy and sent "New complaint" emails and texts.
    if (requestedAction === "editComplaint") {
      const editActor = await getAdminIdentity(request);
      if (!editActor) return NextResponse.json({ success: false, error: "Log in first. Nothing was saved." }, { status: 401 });
      const id = clean(complaint.id || complaint.complaintId || body.id);
      const accountName = clean(complaint.accountName || getText(complaint, "Account Name"));
      if (!id) return NextResponse.json({ success: false, error: "Which complaint? Reload the page. Nothing was saved." }, { status: 400 });
      if (!accountName) return NextResponse.json({ success: false, error: "Pick the account. Nothing was saved." }, { status: 400 });
      // Resolving needs proof of fix: Edit cannot set Closed / Resolved on an open complaint that has none.
      if (isResolvedStatus(clean(complaint.status))) {
        const editRowId = await complaintRowId(id);
        if (editRowId !== null) {
          const current = (await getComplaintsAppsScriptShape()).find((c) => c.id === id || String(c.rowNumber) === clean(complaint.rowNumber));
          if (current && !isResolvedStatus(current.status) && (await needsFixProof(editRowId))) {
            return NextResponse.json({ success: false, error: "To close it, use “Mark fixed” on the complaint page and add the after photo. Nothing was saved." }, { status: 400 });
          }
        }
      }
      let edited: Awaited<ReturnType<typeof editComplaint>>;
      try {
        edited = await editComplaint({
          rowNumber: complaint.rowNumber || body.rowNumber || "",
          id,
          accountId: clean(complaint.accountId || getText(complaint, "Account ID")),
          accountName,
          complaintDate: clean(complaint.complaintDate || complaint.date),
          issue: clean(complaint.issue || complaint.description),
          priority: clean(complaint.priority || complaint.severity),
          status: clean(complaint.status),
          complaintValidity: clean(complaint.complaintValidity || complaint.validity),
          assignedTo: clean(complaint.assignedTo || complaint.manager),
          reportedBy: clean(complaint.reportedBy),
          followUpDate: clean(complaint.followUpDate || complaint.lastFollowUp),
          notes: clean(complaint.notes),
          resolution: clean(complaint.resolution || complaint.resolutionNotes),
        });
      } catch (error) {
        console.error("[complaints editComplaint]", error instanceof Error ? error.message : error);
        const message = error instanceof Error && error.message.startsWith("Complaint not found") ? error.message : "The changes were not saved. Try again.";
        return NextResponse.json({ success: false, error: message }, { status: error instanceof Error && error.message.startsWith("Complaint not found") ? 404 : 500 });
      }
      if (edited.changes.length > 0) {
        // "Complaint edited" with what changed (long texts shortened in the log line).
        const short = (text: string) => (text.length > 60 ? `${text.slice(0, 57)}...` : text || "(blank)");
        await logActivity({
          actorAccountId: editActor.accountId ?? null,
          actorRole: editActor.role ?? "manager",
          actorName: editActor.name || "",
          action: "update",
          entityType: "complaint",
          entityId: edited.id,
          detail: `Complaint edited: ${edited.changes.map((change) => `${change.label}: ${short(change.before)} → ${short(change.after)}`).join("; ")}`,
        }).catch((error) => console.error("[complaints editComplaint] log:", error instanceof Error ? error.message : error));
      }
      // A new status, note or resolution answers the complaint (the response clock stops).
      if (edited.changes.some((change) => change.label === "Status" || change.label === "Notes" || change.label === "Resolution")) {
        await markFirstResponse(String(edited.rowNumber), editActor.name || "Staff");
      }
      // Closed from Edit (it already had its proof): the customer's "It's fixed" email, like Close.
      const statusChange = edited.changes.find((change) => change.label === "Status");
      if (statusChange && isResolvedStatus(statusChange.after) && !isResolvedStatus(statusChange.before)) {
        const editedRowId = await complaintRowId(String(edited.rowNumber));
        const origin = new URL(request.url).origin;
        if (editedRowId !== null) after(() => sendCustomerFixedEmail(editedRowId, origin).catch((error) => console.error("[complaints edit] customer email:", error instanceof Error ? error.message : error)));
      }
      return NextResponse.json({ success: true, id: edited.id, rowNumber: edited.rowNumber, changes: edited.changes, message: edited.changes.length ? "Complaint updated." : "Nothing changed." });
    }

    // Only an add makes a new complaint. Anything else this route does not
    // know is refused (it used to become a new complaint).
    if (requestedAction !== "addComplaint") {
      return NextResponse.json({ success: false, error: `Unknown action "${requestedAction}". Nothing was saved.` }, { status: 400 });
    }

    // A new complaint is saved in Postgres (appendComplaint, lib/data/complaints.ts).
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
      // "Customer sees this" switched off on the form: kept on the complaint (on is the default, nothing stored).
      if ((body as { customerSees?: unknown }).customerSees === false) {
        const newRowId = await complaintRowId(complaintId).catch(() => null);
        const actor = await getAdminIdentity(request).catch(() => null);
        if (newRowId !== null) {
          await addComplaintEvent({ complaintId: newRowId, kind: "customer_visibility", channel: "hidden", detail: "Hidden from the customer (when it was added).", by: actor?.name || "Staff" });
        }
      }
    } catch (error) {
      return NextResponse.json(
        {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to save the complaint.",
        },
        { status: 500 }
      );
    }

    // Internal ops notification — mirrors the old Apps Script addComplaint's
    // sendInternalNotificationEmail: fires unconditionally on every new
    // complaint (no subcontractor/manager gating), to the fixed ops inbox.
    // Wrapped in after() for the same reason as the SMS/email blocks below —
    // a slow or failed send must not hold up or fail the complaint save.
    after(async () => {
      try {
        await sendInternalNotification(
          `New Complaint Created - ${fields.accountName || "Cleaning World"}`,
          [
            `Account: ${fields.accountName || "-"}`,
            `Complaint Date: ${fields.complaintDate || "-"}`,
            `Issue: ${fields.issue || "-"}`,
            `Priority: ${fields.priority || "-"}`,
            `Status: ${fields.status || "-"}`,
            `Validity: ${fields.complaintValidity || "-"}`,
            `Assigned To: ${fields.assignedTo || "-"}`,
            `Subcontractor: ${fields.subcontractor || "-"}`,
            `Reported By: ${fields.reportedBy || "-"}`,
            `Follow-Up Date: ${fields.lastFollowUpDate || "-"}`,
            `Notes: ${fields.notes || "-"}`,
          ]
        );
      } catch (error) {
        console.error(
          "[email] internal complaint notification failed:",
          error instanceof Error ? error.message : error
        );
      }
    });

    // The sub who has the account: email (English, Spanish, Portuguese, with a
    // button to the complaint in the sub portal) + a short text with no link,
    // each written on the complaint (lib/complaintSubNotice.ts). After the
    // answer is sent; a failed notice never fails the save. Before Nov 9,
    // 2026 this texted and emailed the sub typed on the form, with the
    // Validity in the email, and wrote nothing down.
    {
      const origin = new URL(request.url).origin;
      const notifier = await getAdminIdentity(request);
      after(() =>
        notifySubOfComplaint({ key: complaintId, origin, by: notifier?.name || "System" }).catch((error) =>
          console.error("[complaints addComplaint] sub notice:", error instanceof Error ? error.message : error)
        )
      );
    }

    const createActor = await getAdminIdentity(request);
    if (createActor?.accountId) {
      await logActivity({
        actorAccountId: createActor.accountId,
        actorRole: createActor.role ?? "manager",
        actorName: createActor.name || "",
        action: "create",
        entityType: "complaint",
        entityId: complaintId,
      });
    }

    return NextResponse.json({
      success: true,
      id: complaintId,
      rowNumber: "",
      message: "Complaint saved successfully.",
    });
  } catch (error) {
    console.error(
      "[complaints] unexpected error in POST:",
      error instanceof Error ? error.message : error
    );
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