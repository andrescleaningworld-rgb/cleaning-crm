// A to-do's pin and the to-do are one piece of work, so what happens to the
// pin happens to the to-do (docs/unification-plan.md, Phase 1):
//
//   Done on the pin        the to-do is Done, its calendar event is marked
//                          done and its reminders stop
//   Pin back               a to-do that its pin finished opens again
//   Moved to a manager     the to-do, its reminders and its calendar color go
//                          to that manager
//   Moved to a shared box  the to-do keeps its manager
//
// A Visit to-do is not finished from its pin: Done on the To-Do page opens the
// form that logs the visit, and skipping it would lose that record.
// Server only.

import { getSql } from "@/lib/db";
import { fetchToDos, setToDoCalendarFields, updateToDo, updateToDoStatus, type ToDo } from "@/lib/data/todos";
import { updateCalendarEventForToDo } from "@/lib/googleCalendar";
import { todoEventExtras } from "@/lib/pg/todo-extras";

const PIN_PREFIX = "pin-todo-";
const FINISHED = ["done", "cancelled", "canceled", "completed"];
const isFinished = (status: string) => FINISHED.includes(status.trim().toLowerCase());

export const VISIT_PIN_MESSAGE = "This is a visit. Tap Open full details, then Done, so the visit gets logged.";

/** The to-do a paper points at; "" when the paper is not a to-do's pin. */
export function paperToDoId(kind: string, itemId: string): string {
  return kind === "note" && itemId.startsWith(PIN_PREFIX) ? itemId.slice(PIN_PREFIX.length) : "";
}

async function findToDo(id: string): Promise<ToDo | null> {
  return (await fetchToDos()).find((todo) => todo.id.trim() === id) ?? null;
}

async function pinIsUp(itemId: string): Promise<boolean> {
  const rows = (await getSql()`
    SELECT 1 FROM handoff_items
    WHERE kind = 'note' AND item_id = ${itemId} AND board_pinned_at IS NOT NULL AND board_done_at IS NULL
    LIMIT 1
  `) as unknown[];
  return rows.length > 0;
}

/**
 * Call before a pin is taken down as Done. Finishes its to-do, and returns the
 * words to show when the pin must stay up (a Visit). Throws when the to-do
 * could not be saved, so the pin never comes down with its to-do still open.
 */
export async function finishToDoOfPin(kind: string, itemId: string): Promise<string | null> {
  const id = paperToDoId(kind, itemId);
  if (!id || !(await pinIsUp(itemId))) return null;
  const todo = await findToDo(id);
  if (!todo || isFinished(todo.status)) return null;
  if (todo.taskType.trim().toLowerCase() === "visit") return VISIT_PIN_MESSAGE;

  // The notes the manager wrote stay.
  const { accountName, why, calendarEventId } = await updateToDoStatus(id, "Done", todo.notes);
  // Remembered on the pin, so Pin back reopens only a to-do that its pin closed.
  await getSql()`UPDATE handoff_items SET data = data || '{"closedByPin":"1"}'::jsonb WHERE kind = 'note' AND item_id = ${itemId}`;
  if (calendarEventId) {
    const result = await updateCalendarEventForToDo({ eventId: calendarEventId, accountName, why, status: "Done" });
    await setToDoCalendarFields(id, { calendarSyncFailed: result.failed });
  }
  return null;
}

/** Call after Pin back: a to-do that this pin finished opens again, with its calendar reminders. */
export async function reopenToDoOfPin(kind: string, itemId: string): Promise<void> {
  const id = paperToDoId(kind, itemId);
  if (!id) return;
  const rows = (await getSql()`
    UPDATE handoff_items SET data = data - 'closedByPin' - 'recordDoneOn'
    WHERE kind = 'note' AND item_id = ${itemId} AND data->>'closedByPin' = '1'
    RETURNING item_id
  `) as unknown[];
  if (rows.length === 0) return;
  const todo = await findToDo(id);
  if (!todo || todo.status.trim().toLowerCase() !== "done") return;

  const { accountName, why, calendarEventId } = await updateToDoStatus(id, "Open", todo.notes);
  if (calendarEventId) {
    const { dueTime } = await todoEventExtras(id);
    const result = await updateCalendarEventForToDo({ eventId: calendarEventId, accountName, why, status: "Open", restoreReminders: true, dueDate: todo.dueDate, dueTime });
    await setToDoCalendarFields(id, { calendarSyncFailed: result.failed });
  }
}

/**
 * Call when a to-do's pin moves into a manager's square: the to-do becomes
 * theirs. The reminders read the to-do's manager, so they follow. The one text
 * is the board's "New on the board for you". Throws when it could not be saved.
 */
export async function reassignToDoOfPin(kind: string, itemId: string, managerName: string): Promise<void> {
  const id = paperToDoId(kind, itemId);
  const name = managerName.trim();
  if (!id || !name) return;
  const todo = await findToDo(id);
  if (!todo || isFinished(todo.status) || todo.assignedTo.trim().toLowerCase() === name.toLowerCase()) return;

  const saved = await updateToDo(id, { assignedTo: name });
  if (saved.previousCalendarEventId) {
    const result = await updateCalendarEventForToDo({ eventId: saved.previousCalendarEventId, accountName: saved.accountName, why: saved.why, status: saved.status, assignedTo: name });
    await setToDoCalendarFields(id, { calendarSyncFailed: result.failed });
  }
}
