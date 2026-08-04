import type { ToDo } from "../page";
import PrintHeader from "./PrintHeader";

function sortByDueDate(todos: ToDo[]): ToDo[] {
  return [...todos].sort((a, b) => {
    const aTime = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

function groupByManager(todos: ToDo[]): Map<string, ToDo[]> {
  const groups = new Map<string, ToDo[]>();
  for (const todo of todos) {
    const key = todo.assignedTo || "Unassigned";
    const list = groups.get(key) ?? [];
    list.push(todo);
    groups.set(key, list);
  }
  return groups;
}

// Review view, not an action sheet — grouped by assignee (alphabetical),
// no checkbox glyph. Rendered into the same .todo-print-view opt-in
// container convention as PrintTaskSheet.
export default function PrintByManager({ todos }: { todos: ToDo[] }) {
  const groups = groupByManager(todos);
  const managerNames = Array.from(groups.keys()).sort((a, b) => a.localeCompare(b));

  return (
    <div className="todo-print-view">
      <PrintHeader subtitle={`${todos.length} task${todos.length === 1 ? "" : "s"} — By Manager`} />

      {managerNames.length === 0 ? (
        <p className="text-sm text-slate-500">No tasks to print.</p>
      ) : (
        managerNames.map((name) => {
          const managerTodos = sortByDueDate(groups.get(name) ?? []);
          return (
            <section key={name} className="todo-print-row mb-5">
              <h2 className="border-b border-slate-800 pb-1 text-sm font-bold uppercase tracking-wide">
                {name} ({managerTodos.length})
              </h2>
              <table className="mt-2 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-left text-xs uppercase text-slate-600">
                    <th className="py-1 pr-2">Task</th>
                    <th className="py-1 pr-2">Due Date</th>
                    <th className="py-1 pr-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {managerTodos.map((todo) => (
                    <tr key={todo.id} className="border-b border-slate-200 align-top">
                      <td className="py-1.5 pr-2">
                        <div className="font-semibold">{todo.accountName || todo.taskType || "Task"}</div>
                        {todo.why ? <div className="text-xs text-slate-600">{todo.why}</div> : null}
                      </td>
                      <td className="py-1.5 pr-2">{todo.dueDate || "-"}</td>
                      <td className="py-1.5 pr-2">{todo.status || "Open"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })
      )}
    </div>
  );
}
