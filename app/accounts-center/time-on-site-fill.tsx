"use client";

// Accounts Center → "Time on site": the quick fill-in. One account at a time
// on a big card, sorted by sub, so the office can phone one sub and go
// through all of that sub's accounts in one call. "Looks right" saves what
// is showing and moves to the next one; "Skip" moves on without saving.
//
// To do: every account still on the 1h 30m estimate, and every account
// where the sub answered something far from what the office had set.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BigButton, Card, EmptyState, ErrorBox, Screen, SelectField, SkeletonList, StatusPill, showToast } from "@/app/ui";
import PlusMinus from "../components/plus-minus";
import AccountLink from "../components/AccountLink";
import { formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE, MINUTES_ON_SITE_STEP, type TimeOnSite } from "@/lib/time-on-site";

type Item = TimeOnSite & { accountName: string; subName: string; cleaningDays: string; frequency: string; hasSchedule: boolean };

const ALL = "";
const isToDo = (item: Item) => item.source === "est" || item.subMinutes !== null;

export default function TimeOnSiteFill() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [on, setOn] = useState(true);
  const [error, setError] = useState("");
  const [sub, setSub] = useState(ALL);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/time-on-site?list=1", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; on?: boolean; accounts?: Item[]; error?: string };
      if (!data.success) throw new Error(data.error || "The list did not load.");
      setOn(data.on === true);
      setItems(data.accounts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The list did not load.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const subs = useMemo(() => {
    const left = new Map<string, number>();
    for (const item of items ?? []) {
      const name = item.subName || "No sub";
      left.set(name, (left.get(name) ?? 0) + (isToDo(item) ? 1 : 0));
    }
    return Array.from(left.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const inView = (items ?? []).filter((item) => sub === ALL || (item.subName || "No sub") === sub);
  const toDo = inView.filter(isToDo);
  const current = toDo.find((item) => !skipped.includes(item.accountId)) ?? null;
  const total = items?.length ?? 0;
  const done = (items ?? []).filter((item) => !isToDo(item)).length;

  // The − / + start from the account's own figure, or the sub's answer when there is one.
  const currentId = current?.accountId ?? "";
  useEffect(() => {
    if (!current) return;
    setMinutes(current.subMinutes ?? current.minutes);
    // Only when another account comes up, not when the list reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  async function save() {
    if (!current) return;
    setSaving(true);
    try {
      const response = await fetch("/api/time-on-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: current.accountId, minutes }),
      });
      const data = (await response.json()) as { success?: boolean; time?: TimeOnSite; error?: string };
      if (!data.success || !data.time) throw new Error(data.error || "Not saved.");
      const saved = data.time;
      setItems((list) => (list ?? []).map((item) => (item.accountId === saved.accountId ? { ...item, ...saved } : item)));
      showToast(`${current.accountName}: ${formatMinutes(saved.minutes)} ✓`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Not saved.", "bad");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorBox title={error} onRetry={load} />;
  if (!items) return <SkeletonList />;
  if (!on) return <EmptyState title="Not turned on yet" text="Time on site comes with the next database update." />;

  return (
    <Screen title="Time on site" subtitle={`${done} of ${total} done`}>
      <SelectField
        label="Sub"
        value={sub}
        onChange={(event) => {
          setSub(event.target.value);
          setSkipped([]);
        }}
      >
        <option value={ALL}>All subs</option>
        {subs.map(([name, left]) => (
          <option key={name} value={name}>
            {name} {left > 0 ? `(${left} to do)` : "✓"}
          </option>
        ))}
      </SelectField>

      {current ? (
        <Card
          title={<AccountLink accountId={current.accountId} name={current.accountName} />}
          right={current.hasSchedule ? null : <StatusPill kind="needs-you">No schedule</StatusPill>}
        >
          <p className="font-bold">{current.subName || "No sub"}</p>
          <p className="text-slate-600">{[current.cleaningDays, current.frequency].filter(Boolean).join(" · ") || "No days on file"}</p>
          {current.subMinutes !== null ? (
            <p className="mt-2 font-bold text-amber-700">
              Sub says {formatMinutes(current.subMinutes)} · office had {formatMinutes(current.minutes)}
            </p>
          ) : null}
          <div className="my-4 flex flex-col items-center gap-2">
            <PlusMinus
              value={minutes}
              onChange={setMinutes}
              step={MINUTES_ON_SITE_STEP}
              min={MIN_MINUTES_ON_SITE}
              max={MAX_MINUTES_ON_SITE}
              label="Time on site"
              format={formatMinutes}
              disabled={saving}
            />
            {current.source === "est" && current.subMinutes === null ? <p className="text-sm text-slate-600">Estimate</p> : null}
          </div>
          <div className="flex flex-wrap gap-3">
            <BigButton busy={saving} busyLabel="Saving…" onClick={save}>
              ✓ Looks right
            </BigButton>
            <BigButton kind="second" disabled={saving} onClick={() => setSkipped((list) => [...list, current.accountId])}>
              Skip
            </BigButton>
          </div>
        </Card>
      ) : toDo.length > 0 ? (
        <EmptyState title="Only skipped ones left" text={`${toDo.length} skipped.`} action={<BigButton kind="second" onClick={() => setSkipped([])}>Show them again</BigButton>} />
      ) : (
        <EmptyState title="All done ✓" text={sub === ALL ? "Every account has its time on site." : `Every account of ${sub} has its time on site.`} />
      )}
    </Screen>
  );
}
