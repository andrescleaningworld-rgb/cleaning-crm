import type { ToDo } from "../page";
import PrintHeader from "./PrintHeader";

// Missing due dates sort to the end in both print layouts — a to-do with no
// due date isn't "most urgent," it just hasn't been scheduled yet.
function sortByDueDate(todos: ToDo[]): ToDo[] {
  return [...todos].sort((a, b) => {
    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

// Flat, hand-off-able checklist — rendered into the .todo-print-view opt-in
// container (see the @media print rules in page.tsx) so it's the only thing
// visible when window.print() runs, regardless of what's on screen.
export default function PrintTaskSheet({ todos }: { todos: ToDo[] }) {
  const sorted = sortByDueDate(todos);

  return (
    <div className="todo-print-view">
      <PrintHeader subtitle={`${sorted.length} task${sorted.length === 1 ? "" : "s"} — Task Sheet`} />

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-slate-800 text-left">
            <th className="w-8 py-2 pr-2"></th>
            <th className="py-2 pr-2">Task</th>
            <th className="py-2 pr-2">Assigned To</th>
            <th className="py-2 pr-2">Due Date</th>
            <th className="py-2 pr-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((todo) => (
            <tr key={todo.id} className="todo-print-row border-b border-slate-300 align-top">
              <td className="py-2 pr-2 text-base">&#9744;</td>
              <td className="py-2 pr-2">
                <div className="font-semibold">{todo.accountName || todo.taskType || "Task"}</div>
                {todo.why ? <div className="text-xs text-slate-600">{todo.why}</div> : null}
              </td>
              <td className="py-2 pr-2">{todo.assignedTo || "-"}</td>
              <td className="py-2 pr-2">{todo.dueDate || "-"}</td>
              <td className="py-2 pr-2">{todo.status || "Open"}</td>
            </tr>
          ))}
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-slate-500">
                No tasks to print.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
