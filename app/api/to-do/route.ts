import { NextRequest, NextResponse } from "next/server";
import {
  appendToDo,
  appendToDos,
  fetchManagers,
  fetchToDos,
  setToDoCalendarFields,
  setToDoCalendarFieldsBatch,
  setToDoCalendarSyncFailed,
  updateToDo,
  updateToDoOutcome,
  updateToDosBatch,
  updateToDoStatus,
} from "@/lib/googleSheets";
import {
  createCalendarEventForToDo,
  deleteCalendarEventForToDo,
  updateCalendarEventForToDo,
  type ToDoCalendarInput,
} from "@/lib/googleCalendar";
import { normalizeToDoPriority } from "@/lib/toDoPriority";
import { sanitizeSmsText, sendSms } from "@/lib/sms";

// Fire-and-forget: looks up the assigned manager's phone by name (the same
// case-insensitive match getManagerCalendarColorId uses — to-dos have no
// Manager ID field, only the assignee's name) and texts them. Never awaited
// by the caller, and any failure is swallowed inside sendSms itself.
//
// Body is title / full description / deep link, deliberately unsanitized-
// for-length (sanitizeSmsText(..., Infinity) strips to ASCII but never
// truncates) — the description is whatever the manager or the person who
// filed the to-do actually wrote, so shortening it would drop real content.
// "Description" here is `why` (the to-do's required, always-populated
// description field, shown as "Why:" on the card) plus `notes` (a separate,
// optional "latest update" field — usually blank at creation) when present.
function notifyManagerOfNewToDo(id: string, input: ToDoCalendarInput, origin: string): void {
  const assignedTo = input.assignedTo.trim();
  if (!assignedTo) return;

  fetchManagers()
    .then((managers) => {
      const target = assignedTo.toLowerCase();
      const manager = managers.find((m) => m.name.trim().toLowerCase() === target);

      if (!manager) {
        console.debug(`[sms] skip to-do notify: no manager matching "${assignedTo}"`);
        return;
      }
      if (!manager.phone.trim()) {
        console.debug(`[sms] skip to-do notify: manager "${manager.name}" has no phone on file`);
        return;
      }

      const title = input.accountName || input.taskType || "Reminder";
      const description = [input.why, input.notes]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" - ");
      const link = `${origin}/to-do?id=${encodeURIComponent(id)}`;

      const rawMessage = [`New to-do: ${title}, due ${input.dueDate}`, description, link]
        .filter(Boolean)
        .join("\n");
      const message = sanitizeSmsText(rawMessage, Infinity);
      void sendSms(manager.phone, message, "to-do/addToDo");
    })
    .catch((error) => {
      console.error("[sms] to-do notify lookup failed:", error instanceof Error ? error.message : error);
    });
}

// Shared by the single-edit and bulk-edit actions: given a to-do's
// resolved post-edit fields and its pre-edit calendarEventId, decide
// whether to create a new Calendar event (newly eligible), patch the
// existing one (still eligible), cancel it (no longer eligible), or do
// nothing (was never eligible and still isn't). Returns the calendarEventId
// to persist (unchanged, cleared, or newly created) and whether the
// Calendar call itself failed.
async function syncCalendarAfterEdit(
  previousCalendarEventId: string,
  resolved: { taskType: string; dueDate: string; accountName: string; why: string; notes: string; assignedTo: string; status: string; syncToCalendar: boolean }
): Promise<{ calendarEventId: string; calendarSyncFailed: boolean }> {
  const nowEligible = resolved.syncToCalendar && Boolean(resolved.dueDate);

  if (previousCalendarEventId && nowEligible) {
    const result = await updateCalendarEventForToDo({
      eventId: previousCalendarEventId,
      accountName: resolved.accountName,
      why: resolved.why,
      status: resolved.status,
      dueDate: resolved.dueDate,
      assignedTo: resolved.assignedTo,
    });
    return { calendarEventId: previousCalendarEventId, calendarSyncFailed: result.failed };
  }

  if (previousCalendarEventId && !nowEligible) {
    const result = await deleteCalendarEventForToDo(previousCalendarEventId);
    return { calendarEventId: "", calendarSyncFailed: result.failed };
  }

  if (!previousCalendarEventId && nowEligible) {
    const result = await createCalendarEventForToDo(resolved);
    return { calendarEventId: result.eventId ?? "", calendarSyncFailed: result.failed };
  }

  return { calendarEventId: "", calendarSyncFailed: false };
}

export async function GET() {
  try {
    const todos = await fetchToDos();

    // Deliberately uncached: this list is expected to reflect a create/
    // status-update immediately after the action that caused it, and an
    // HTTP-cached response here previously made just-created to-dos look
    // like they hadn't saved.
    return NextResponse.json({
      success: true,
      todos,
      message: "",
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to load to-dos.",
        todos: [],
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const action =
      typeof body.action === "string" && body.action
        ? body.action
        : "addToDo";

    if (action === "addToDo") {
      const input: ToDoCalendarInput = {
        dueDate: String(body.dueDate ?? ""),
        assignedTo: String(body.assignedTo ?? ""),
        accountName: String(body.accountName ?? ""),
        taskType: String(body.taskType ?? ""),
        why: String(body.why ?? ""),
        status: String(body.status || "Open"),
        notes: String(body.notes ?? ""),
        syncToCalendar: typeof body.syncToCalendar === "boolean" ? body.syncToCalendar : true,
      };
      const priority = normalizeToDoPriority(body.priority);

      // Calendar event is created BEFORE the Sheets row so its id (and
      // whether the sync failed) can be written in the same append — see
      // appendToDo's calendarEventId comment for why this avoids a second
      // write-back step. Best-effort: createCalendarEventForToDo never
      // throws, so a Calendar failure still lets the to-do itself save.
      const { eventId: calendarEventId, failed: calendarSyncFailed } = await createCalendarEventForToDo(input);

      const id = await appendToDo({
        ...input,
        groupId: typeof body.groupId === "string" ? body.groupId : "",
        calendarEventId: calendarEventId ?? "",
        calendarSyncFailed,
        priority,
      });

      notifyManagerOfNewToDo(id, input, new URL(request.url).origin);

      return NextResponse.json({ success: true, id, calendarSyncFailed });
    }

    // One to-do per account, written as a single batched Sheets append —
    // see appendToDos' comment for why this can't be N separate addToDo
    // calls fired concurrently. An empty-string entry is valid here (a
    // Reminder with no account attached still writes one row, just with
    // a blank ACCOUNT column) — only a missing/empty array is rejected.
    if (action === "addToDos") {
      const accountNames: string[] = Array.isArray(body.accountNames)
        ? body.accountNames.map((name: unknown) => String(name))
        : [];

      if (accountNames.length === 0) {
        return NextResponse.json(
          { success: false, message: "No accounts provided." },
          { status: 400 }
        );
      }

      const shared = {
        dueDate: String(body.dueDate ?? ""),
        assignedTo: String(body.assignedTo ?? ""),
        taskType: String(body.taskType ?? ""),
        why: String(body.why ?? ""),
        status: String(body.status || "Open"),
        notes: String(body.notes ?? ""),
        groupId: typeof body.groupId === "string" ? body.groupId : "",
        syncToCalendar: typeof body.syncToCalendar === "boolean" ? body.syncToCalendar : true,
      };
      const priority = normalizeToDoPriority(body.priority);

      const entries: (ToDoCalendarInput & { groupId: string; priority: typeof priority })[] = accountNames.map((accountName) => ({
        ...shared,
        accountName,
        priority,
      }));

      // Independent Calendar API calls (unlike Sheets appends, creating N
      // separate events has no shared-row race to worry about), so these
      // run in parallel rather than needing the single-request batching
      // appendToDos itself requires.
      const calendarResults = await Promise.all(
        entries.map((entry: ToDoCalendarInput) => createCalendarEventForToDo(entry))
      );

      const ids = await appendToDos(
        entries.map((entry: ToDoCalendarInput & { groupId: string; priority: typeof priority }, index: number) => ({
          ...entry,
          calendarEventId: calendarResults[index].eventId ?? "",
          calendarSyncFailed: calendarResults[index].failed,
        }))
      );

      return NextResponse.json({
        success: true,
        ids,
        calendarSyncFailed: calendarResults.some((result) => result.failed),
      });
    }

    if (action === "updateToDoStatus") {
      const toDoId = String(body.toDoId ?? "");

      if (!toDoId) {
        return NextResponse.json(
          { success: false, message: "Missing toDoId." },
          { status: 400 }
        );
      }

      const status = String(body.status ?? "");

      const { accountName, why, calendarEventId } = await updateToDoStatus(
        toDoId,
        status,
        String(body.notes ?? "")
      );

      let calendarSyncFailed = false;
      if (calendarEventId) {
        const result = await updateCalendarEventForToDo({ eventId: calendarEventId, accountName, why, status });
        calendarSyncFailed = result.failed;
        await setToDoCalendarSyncFailed(toDoId, calendarSyncFailed);
      }

      return NextResponse.json({ success: true, calendarSyncFailed });
    }

    // Full-field edit — Assigned To / Type / Due Date / Status / Notes /
    // Sync to Calendar. Unlike updateToDoStatus, any of these can flip
    // Calendar eligibility (Sync to Calendar toggled off/on, due date
    // added/cleared), so this recomputes and reconciles the Calendar event
    // afterward via syncCalendarAfterEdit rather than just patching a title
    // in place. Only keys actually present in the request body are written —
    // omitted fields keep their existing sheet value (see updateToDo's own
    // comment).
    if (action === "updateToDo") {
      const toDoId = String(body.toDoId ?? "");

      if (!toDoId) {
        return NextResponse.json(
          { success: false, message: "Missing toDoId." },
          { status: 400 }
        );
      }

      const edits: Parameters<typeof updateToDo>[1] = {};
      if (body.dueDate !== undefined) edits.dueDate = String(body.dueDate);
      if (body.assignedTo !== undefined) edits.assignedTo = String(body.assignedTo);
      if (body.taskType !== undefined) edits.taskType = String(body.taskType);
      if (body.status !== undefined) edits.status = String(body.status);
      if (body.notes !== undefined) edits.notes = String(body.notes);
      if (body.syncToCalendar !== undefined) edits.syncToCalendar = Boolean(body.syncToCalendar);
      if (body.priority !== undefined) edits.priority = normalizeToDoPriority(body.priority);

      const resolved = await updateToDo(toDoId, edits);

      const { calendarEventId, calendarSyncFailed } = await syncCalendarAfterEdit(
        resolved.previousCalendarEventId,
        resolved
      );

      // Always persisted (not just on change) — a retried sync can succeed
      // on the same eventId, and that success must clear a previously-set
      // calendarSyncFailed flag even though the id itself didn't change.
      await setToDoCalendarFields(toDoId, { calendarEventId, calendarSyncFailed });

      return NextResponse.json({ success: true, calendarSyncFailed });
    }

    // Bulk edit — same Assigned To / Type / Due Date / Status fields as
    // updateToDo above, applied identically to every selected to-do. Unlike
    // the single-edit action, an empty string here means "leave this field
    // alone" (not "clear it") — a shared bulk form has no way to represent
    // "clear this for everyone" separately from "I didn't fill this in", so
    // blank is always treated as untouched. Sync to Calendar uses the same
    // "untouched unless present" convention, but since it's a boolean with
    // no meaningful empty-string state, presence is signaled by the value
    // actually being a boolean (`true`/`false`) rather than a non-empty
    // string — see the syncToCalendar check below. All Sheet field writes go
    // through one updateToDosBatch call rather than one updateToDo per id;
    // Calendar itself has no batch API, so those calls still happen one per
    // to-do, but their resulting calendarEventId/calendarSyncFailed writes
    // are folded back into a single setToDoCalendarFieldsBatch call too.
    if (action === "updateToDos") {
      const toDoIds: string[] = Array.isArray(body.toDoIds)
        ? body.toDoIds.map((id: unknown) => String(id)).filter(Boolean)
        : [];

      if (toDoIds.length === 0) {
        return NextResponse.json(
          { success: false, message: "No to-dos selected." },
          { status: 400 }
        );
      }

      const edits: Parameters<typeof updateToDo>[1] = {};
      if (typeof body.dueDate === "string" && body.dueDate !== "") edits.dueDate = body.dueDate;
      if (typeof body.assignedTo === "string" && body.assignedTo !== "") edits.assignedTo = body.assignedTo;
      if (typeof body.taskType === "string" && body.taskType !== "") edits.taskType = body.taskType;
      if (typeof body.status === "string" && body.status !== "") edits.status = body.status;
      if (typeof body.syncToCalendar === "boolean") edits.syncToCalendar = body.syncToCalendar;
      if (typeof body.priority === "string" && body.priority !== "") edits.priority = normalizeToDoPriority(body.priority);

      if (Object.keys(edits).length === 0) {
        return NextResponse.json(
          { success: false, message: "No fields to update — fill in at least one field." },
          { status: 400 }
        );
      }

      const results = await updateToDosBatch(toDoIds.map((toDoId) => ({ toDoId, updates: edits })));
      const found = results.filter((r) => !r.notFound);

      const calendarUpdates = await Promise.all(
        found.map(async (result) => {
          const { calendarEventId, calendarSyncFailed } = await syncCalendarAfterEdit(
            result.previousCalendarEventId,
            result
          );
          return { sheetRow: result.sheetRow, calendarEventId, calendarSyncFailed };
        })
      );

      await setToDoCalendarFieldsBatch(calendarUpdates);

      return NextResponse.json({
        success: true,
        updated: found.length,
        notFound: results.filter((r) => r.notFound).map((r) => r.toDoId),
        calendarSyncFailed: calendarUpdates.some((update) => update.calendarSyncFailed),
      });
    }

    if (action === "updateToDoOutcome") {
      const toDoId = String(body.toDoId ?? "");

      if (!toDoId) {
        return NextResponse.json(
          { success: false, message: "Missing toDoId." },
          { status: 400 }
        );
      }

      await updateToDoOutcome(toDoId, String(body.outcome ?? ""));

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, message: `Unsupported action "${action}".` },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to save to-do.",
      },
      { status: 500 }
    );
  }
}
