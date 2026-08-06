import { after, NextRequest, NextResponse } from "next/server";
import {
  appendSmsLog,
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

// Best-effort SmsLog write — never lets a Sheets error mask the send
// outcome that already happened (and was already logged via console by
// sendSms/the caller) above it. Exported so the resend endpoint's rate
// limit can read the same log this writes to.
async function logSmsAttempt(
  toDoId: string,
  managerPhone: string,
  textId: string,
  status: "sent" | "failed",
  quotaRemaining?: number
): Promise<void> {
  try {
    await appendSmsLog({ toDoId, managerPhone, textId, status, quotaRemaining });
  } catch (error) {
    console.error("[sms] failed to write SmsLog row:", error instanceof Error ? error.message : error);
  }
}

// Looks up a manager's phone by name (the same case-insensitive match
// getManagerCalendarColorId uses — to-dos have no Manager ID field, only
// the assignee's name). Shared core for every per-to-do (not batch) SMS
// notification — creation and single reassignment both call this via the
// two thin wrappers below, differing only in `label` (the message's
// opening line) and `routeContext` (the SmsLog/log-line tag).
//
// At every call site, the caller wraps this in after(), which keeps the
// invocation alive until the returned promise settles instead of racing it
// against the instance freezing post-response (a prior fire-and-forget
// .then() chain had no such guarantee: a Sheets lookup timeout or a slow
// Textbelt call could be silently cut off with no trace — confirmed live
// twice). Never throws: every failure is already logged and swallowed here.
//
// A logged row is only written once an actual send was attempted (manager
// matched AND had a phone on file) or once a lookup error prevented even
// getting that far — "no manager matched" / "no phone on file" are legit
// silent skips (nothing was ever attempted), not failures, so they write
// nothing and the UI shows no badge at all for those to-dos.
//
// Body is title / full description / deep link, deliberately unsanitized-
// for-length (sanitizeSmsText(..., Infinity) strips to ASCII but never
// truncates) — the description is whatever the manager or the person who
// filed the to-do actually wrote, so shortening it would drop real content.
// "Description" here is `why` (the to-do's required, always-populated
// description field, shown as "Why:" on the card) plus `notes` (a separate,
// optional "latest update" field — usually blank at creation) when present.
async function sendToDoNotification(
  id: string,
  input: ToDoCalendarInput,
  origin: string,
  label: string,
  routeContext: string
): Promise<void> {
  const assignedTo = input.assignedTo.trim();
  if (!assignedTo) return;

  let manager: Awaited<ReturnType<typeof fetchManagers>>[number] | undefined;
  try {
    const managers = await fetchManagers();
    const target = assignedTo.toLowerCase();
    manager = managers.find((m) => m.name.trim().toLowerCase() === target);
  } catch (error) {
    console.error(`[sms] ${routeContext} lookup failed:`, error instanceof Error ? error.message : error);
    await logSmsAttempt(id, "", "", "failed");
    return;
  }

  if (!manager) {
    console.debug(`[sms] skip ${routeContext}: no manager matching "${assignedTo}"`);
    return;
  }
  if (!manager.phone.trim()) {
    console.debug(`[sms] skip ${routeContext}: manager "${manager.name}" has no phone on file`);
    return;
  }

  const title = input.accountName || input.taskType || "Reminder";
  const description = [input.why, input.notes]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" - ");
  const link = `${origin}/to-do?id=${encodeURIComponent(id)}`;

  const rawMessage = [`${label}: ${title}, due ${input.dueDate}`, description, link]
    .filter(Boolean)
    .join("\n");
  const message = sanitizeSmsText(rawMessage, Infinity);

  const result = await sendSms(manager.phone, message, routeContext);
  await logSmsAttempt(
    id,
    manager.phone,
    result.textId !== undefined ? String(result.textId) : "",
    result.success ? "sent" : "failed",
    result.quotaRemaining
  );
}

// Exported so the resend endpoint (app/api/to-do/[id]/resend-notification/
// route.ts) reuses the exact same lookup/send/log logic rather than a
// second, possibly-drifting copy.
export async function notifyManagerOfNewToDo(id: string, input: ToDoCalendarInput, origin: string): Promise<void> {
  return sendToDoNotification(id, input, origin, "New to-do", "to-do/addToDo");
}

// Fires only when Assigned To actually changed (see the addToDo POST
// handler's previousAssignedTo comparison) — an edit that touches other
// fields but leaves the assignee alone must not re-notify.
async function notifyManagerOfReassignedToDo(id: string, input: ToDoCalendarInput, origin: string): Promise<void> {
  return sendToDoNotification(id, input, origin, "To-do reassigned to you", "to-do/updateToDo");
}

// Batch counterpart for addToDos (multi-account creation) and updateToDos
// (bulk reassignment) — both apply ONE assignedTo value across N to-dos in
// a single action, so this sends ONE summary text per action instead of
// one per to-do (a large batch — this codebase has handled 27-account
// batches before — would otherwise spam the manager with dozens of texts
// at once). Logged against the batch's first to-do id: SmsLog is per-to-do,
// and inventing a group-level tracking row for a summary text isn't worth
// the schema/UI work this pass — the first card gets a real status badge,
// the rest in the batch get none, an honest reflection of "one shared
// notification was sent," not a bug.
async function notifyManagerOfToDoBatch(
  ids: string[],
  accountNames: string[],
  assignedTo: string,
  dueDate: string,
  origin: string,
  label: string,
  routeContext: string
): Promise<void> {
  const target = assignedTo.trim();
  if (!target || ids.length === 0) return;

  let manager: Awaited<ReturnType<typeof fetchManagers>>[number] | undefined;
  try {
    const managers = await fetchManagers();
    const lower = target.toLowerCase();
    manager = managers.find((m) => m.name.trim().toLowerCase() === lower);
  } catch (error) {
    console.error(`[sms] ${routeContext} lookup failed:`, error instanceof Error ? error.message : error);
    await logSmsAttempt(ids[0], "", "", "failed");
    return;
  }

  if (!manager) {
    console.debug(`[sms] skip ${routeContext}: no manager matching "${target}"`);
    return;
  }
  if (!manager.phone.trim()) {
    console.debug(`[sms] skip ${routeContext}: manager "${manager.name}" has no phone on file`);
    return;
  }

  const firstId = ids[0];
  const link = `${origin}/to-do?id=${encodeURIComponent(firstId)}`;

  const cleanNames = accountNames.map((name) => name.trim()).filter(Boolean);
  const preview = cleanNames.slice(0, 3).join(", ");
  const remaining = cleanNames.length - 3;
  const accountsSummary = remaining > 0 ? `${preview}, and ${remaining} more` : preview;

  const countLabel = `${ids.length} to-do${ids.length === 1 ? "" : "s"}`;
  const rawMessage = [
    `${label}: ${countLabel}${accountsSummary ? ` (${accountsSummary})` : ""}, due ${dueDate}`,
    link,
  ]
    .filter(Boolean)
    .join("\n");
  const message = sanitizeSmsText(rawMessage, Infinity);

  const result = await sendSms(manager.phone, message, routeContext);
  await logSmsAttempt(
    firstId,
    manager.phone,
    result.textId !== undefined ? String(result.textId) : "",
    result.success ? "sent" : "failed",
    result.quotaRemaining
  );
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

      after(() => notifyManagerOfNewToDo(id, input, new URL(request.url).origin));

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

      after(() =>
        notifyManagerOfToDoBatch(
          ids,
          accountNames,
          shared.assignedTo,
          shared.dueDate,
          new URL(request.url).origin,
          "New to-dos assigned",
          "to-do/addToDos"
        )
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

      // Only when Assigned To actually changed — an edit that touches other
      // fields but leaves the assignee alone must not re-notify.
      if (
        resolved.assignedTo.trim() &&
        resolved.assignedTo.trim().toLowerCase() !== resolved.previousAssignedTo.trim().toLowerCase()
      ) {
        after(() =>
          notifyManagerOfReassignedToDo(
            toDoId,
            {
              dueDate: resolved.dueDate,
              assignedTo: resolved.assignedTo,
              accountName: resolved.accountName,
              taskType: resolved.taskType,
              why: resolved.why,
              status: resolved.status,
              notes: resolved.notes,
              syncToCalendar: resolved.syncToCalendar,
            },
            new URL(request.url).origin
          )
        );
      }

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

      // Same "only on an actual change" rule as the single-edit action —
      // filtered down to entries where Assigned To really changed, since a
      // bulk edit that didn't touch it at all resolves assignedTo back to
      // each row's unchanged existing value (identical to previousAssignedTo,
      // so this naturally excludes them with no separate "was assignedTo
      // even part of this edit" check needed). The bulk form applies one
      // assignedTo value to every selected to-do, so anything that changed
      // shares the same new assignee — one summary text, not one per to-do.
      const reassigned = found.filter(
        (r) => r.assignedTo.trim() && r.assignedTo.trim().toLowerCase() !== r.previousAssignedTo.trim().toLowerCase()
      );
      if (reassigned.length > 0) {
        after(() =>
          notifyManagerOfToDoBatch(
            reassigned.map((r) => r.toDoId),
            reassigned.map((r) => r.accountName),
            reassigned[0].assignedTo,
            reassigned[0].dueDate,
            new URL(request.url).origin,
            "To-dos reassigned to you",
            "to-do/updateToDos"
          )
        );
      }

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
