"use client";

// "Time on site" in the account's Snapshot: how long a cleaning takes here,
// "(est.)" until the office or the sub confirms it. Tapping it opens big
// − / + buttons. Shows nothing where migration 042 is not on the database.

import { useEffect, useState } from "react";
import { BigButton, Sheet, showToast } from "@/app/ui";
import PlusMinus from "@/app/components/plus-minus";
import { describeTimeOnSite, formatMinutes, MAX_MINUTES_ON_SITE, MIN_MINUTES_ON_SITE, MINUTES_ON_SITE_STEP, TIME_ON_SITE_SOURCE_LABELS, type TimeOnSite } from "@/lib/time-on-site";

export default function TimeOnSiteDetail({ accountId }: { accountId: string }) {
  const [time, setTime] = useState<TimeOnSite | null>(null);
  const [open, setOpen] = useState(false);
  const [minutes, setMinutes] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    let alive = true;
    fetch(`/api/time-on-site?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { on?: boolean; time?: TimeOnSite | null }) => {
        if (alive && data.on && data.time) setTime(data.time);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [accountId]);

  if (!time) return null;

  async function save() {
    setSaving(true);
    try {
      const response = await fetch("/api/time-on-site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, minutes }),
      });
      const data = (await response.json()) as { success?: boolean; time?: TimeOnSite; error?: string };
      if (!data.success || !data.time) throw new Error(data.error || "Not saved.");
      setTime(data.time);
      setOpen(false);
      showToast(`Time on site: ${formatMinutes(data.time.minutes)} ✓`);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Not saved.", "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-detail">
      <dt>Time on site</dt>
      <dd>
        <button
          type="button"
          className="font-bold underline decoration-dotted underline-offset-4"
          onClick={() => {
            setMinutes(time.minutes);
            setOpen(true);
          }}
        >
          {describeTimeOnSite(time)}
        </button>
        {time.subMinutes !== null ? <span className="ml-2 font-bold text-amber-700">Sub says {formatMinutes(time.subMinutes)}</span> : null}

        <Sheet
          open={open}
          title="Time on site"
          text="About how long one cleaning takes here."
          onClose={() => {
            if (!saving) setOpen(false);
          }}
          busy={saving}
          actions={
            <BigButton busy={saving} busyLabel="Saving…" onClick={save}>
              Save
            </BigButton>
          }
        >
          <div className="flex flex-col items-center gap-3 py-2">
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
            <p className="text-sm text-slate-600">{TIME_ON_SITE_SOURCE_LABELS[time.source]}</p>
            {time.subMinutes !== null ? (
              <BigButton kind="second" disabled={saving} onClick={() => setMinutes(time.subMinutes ?? minutes)}>
                Use the sub&apos;s {formatMinutes(time.subMinutes)}
              </BigButton>
            ) : null}
          </div>
        </Sheet>
      </dd>
    </div>
  );
}
