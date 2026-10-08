// Reads compared by `npx tsx scripts/migrate/parity.mts todos`.
// Kept short on purpose: every read on the Sheets side fetches a whole tab,
// and the Sheets API allows 60 reads a minute.
import type { ParityRead } from "../parity.mts";
import { fetchLatestSmsQuota, fetchSmsLogForToDo, fetchToDos } from "../../../lib/data/todos";
import { readTab } from "../lib/sheets-readonly.mjs";

export const AREA = "TODOS";

// The same to-do ids on both sides, read once from the sheet: the to-do with
// the most text attempts, one with a single attempt, one with none.
const attempts = new Map<string, number>();
for (const row of (await readTab("MAIN", "SmsLog", { range: "A:A" })).slice(1)) {
  const id = String(row[0] ?? "").trim();
  if (id) attempts.set(id, (attempts.get(id) ?? 0) + 1);
}
const byCount = [...attempts].sort((a, b) => b[1] - a[1]);
const mostAttempts = byCount[0]?.[0] ?? "";
const oneAttempt = byCount.find(([, n]) => n === 1)?.[0] ?? "";
const noAttempt = (await readTab("MAIN", "To Do", { range: "A:A" })).slice(1).map((r) => String(r[0] ?? "").trim()).find((id) => id && !attempts.has(id)) ?? "";

export const reads: ParityRead[] = [
  { name: "fetchToDos", run: () => fetchToDos() },
  { name: "fetchSmsLogForToDo(most attempts)", run: () => fetchSmsLogForToDo(mostAttempts) },
  { name: "fetchSmsLogForToDo(one attempt)", run: () => fetchSmsLogForToDo(oneAttempt) },
  { name: "fetchSmsLogForToDo(no attempt)", run: () => fetchSmsLogForToDo(noAttempt) },
  { name: "fetchSmsLogForToDo(blank)", run: () => fetchSmsLogForToDo("  ") },
  { name: "fetchSmsLogForToDo(unknown)", run: () => fetchSmsLogForToDo("TODO-does-not-exist") },
  { name: "fetchLatestSmsQuota", run: () => fetchLatestSmsQuota() },
];
