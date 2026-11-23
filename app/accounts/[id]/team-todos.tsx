"use client";

// The account page's "Team to-dos": every CW Now to-do on this account, open
// ones first, then the last 10 done ("Show all" for the rest). Read only here:
// a tap opens the to-do's existing card. Staff only (the account page is).

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, Card, Sheet } from "@/app/ui";
import { CwNowTaskCard, StaffTaskButton } from "@/app/board/cw-now-task";
import { isOpenTask, officeToday, type StaffTaskRow } from "@/lib/cwNowTasks";

const DONE_SHOWN = 10;

export default function TeamTodos({ accountId }: { accountId: string }) {
  const [tasks, setTasks] = useState<StaffTaskRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [openId, setOpenId] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/cw-now-tasks?view=list&status=all&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; ready?: boolean; tasks?: StaffTaskRow[] };
      if (!response.ok || data.success !== true) throw new Error("failed");
      setTasks(data.ready === true ? (data.tasks ?? []) : null);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [accountId]);

  useEffect(() => {
    if (accountId) void load();
  }, [accountId, load]);

  const open = useMemo(() => (tasks ?? []).filter((task) => isOpenTask(task.status)), [tasks]);
  const done = useMemo(() => (tasks ?? []).filter((task) => !isOpenTask(task.status)).sort((a, b) => b.doneAt.localeCompare(a.doneAt)), [tasks]);

  if (!accountId || (!tasks && !failed)) return null;
  const today = officeToday();
  const doneShown = showAll ? done : done.slice(0, DONE_SHOWN);

  return (
    <Card title="Team to-dos">
      {failed ? (
        <p className="ui-field-error">The team to-dos did not load.</p>
      ) : open.length === 0 && done.length === 0 ? (
        <p className="ui-muted">No team to-dos on this account.</p>
      ) : (
        <ul className="ui-list-plain ui-stack" data-team-todos>
          {[...open, ...doneShown].map((task) => (
            <li key={task.id}>
              <StaffTaskButton task={task} today={today} hideAccount onOpen={() => setOpenId(task.id)} />
            </li>
          ))}
        </ul>
      )}
      {done.length > DONE_SHOWN ? (
        <div style={{ marginTop: 8 }}>
          <BigButton kind="quiet" onClick={() => setShowAll((now) => !now)}>
            {showAll ? "Show fewer" : `Show all ${done.length} done`}
          </BigButton>
        </div>
      ) : null}
      <Sheet open={openId > 0} title="CW Now to-do" onClose={() => setOpenId(0)} closeLabel="Close">
        {openId > 0 ? <CwNowTaskCard key={openId} taskId={openId} onChanged={() => void load()} onClosed={() => { setOpenId(0); void load(); }} /> : null}
      </Sheet>
    </Card>
  );
}
