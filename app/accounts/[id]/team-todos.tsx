"use client";

// The account page's "Team to-dos": this account's open CW Now to-dos (up to
// 5), and "See all" for the account's full To-dos list. Read only here: a tap
// opens the to-do's existing card. Staff only (the account page is).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, Sheet } from "@/app/ui";
import { CwNowTaskCard, StaffTaskButton } from "@/app/board/cw-now-task";
import { isOpenTask, officeToday, type StaffTaskRow } from "@/lib/cwNowTasks";

const OPEN_SHOWN = 5;

export default function TeamTodos({ accountId, accountName, reloadKey = 0 }: { accountId: string; accountName: string; /** Changes when a to-do was added here. */ reloadKey?: number }) {
  const [tasks, setTasks] = useState<StaffTaskRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/cw-now-tasks?view=list&status=open&accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" });
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
  }, [accountId, load, reloadKey]);

  const open = useMemo(() => (tasks ?? []).filter((task) => isOpenTask(task.status)), [tasks]);

  if (!accountId || (!tasks && !failed)) return null;
  const today = officeToday();
  const allHref = `/board/sub-todos?accountId=${encodeURIComponent(accountId)}&account=${encodeURIComponent(accountName)}`;

  return (
    <Card title="Team to-dos" right={<Link className="ui-link" href={allHref} data-see-all-todos>See all →</Link>}>
      {failed ? (
        <p className="ui-field-error">The team to-dos did not load.</p>
      ) : open.length === 0 ? (
        <p className="ui-muted">No open team to-dos.</p>
      ) : (
        <ul className="ui-list-plain ui-stack" data-team-todos>
          {open.slice(0, OPEN_SHOWN).map((task) => (
            <li key={task.id}>
              <StaffTaskButton task={task} today={today} hideAccount onOpen={() => setOpenId(task.id)} />
            </li>
          ))}
        </ul>
      )}
      <Sheet open={openId > 0} title="CW Now to-do" onClose={() => setOpenId(0)} closeLabel="Close">
        {openId > 0 ? <CwNowTaskCard key={openId} taskId={openId} onChanged={() => void load()} onClosed={() => { setOpenId(0); void load(); }} /> : null}
      </Sheet>
    </Card>
  );
}
