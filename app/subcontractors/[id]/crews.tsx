"use client";

// "Crews" on the sub's page: how many jobs this sub can do at the same time.
// Coverage → "Who's free?" uses it. Each tap on − / + saves. Shows nothing
// where migration 042 is not on the database.

import { useEffect, useState } from "react";
import { showToast } from "@/app/ui";
import PlusMinus from "@/app/components/plus-minus";

export default function CrewsDetail({ subId }: { subId: string }) {
  const [crews, setCrews] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!subId) return;
    let alive = true;
    fetch(`/api/availability?settings=1&subId=${encodeURIComponent(subId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { crews?: number | null }) => {
        if (alive && typeof data.crews === "number") setCrews(data.crews);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [subId]);

  if (crews === null) return null;

  async function save(next: number) {
    const before = crews;
    setCrews(next);
    setSaving(true);
    try {
      const response = await fetch("/api/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "crews", subId, crews: next }),
      });
      const data = (await response.json()) as { success?: boolean; crews?: number; error?: string };
      if (!data.success || typeof data.crews !== "number") throw new Error(data.error || "Not saved.");
      setCrews(data.crews);
      showToast(`Crews: ${data.crews} ✓`);
    } catch (error) {
      setCrews(before);
      showToast(error instanceof Error ? error.message : "Not saved.", "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ui-detail">
      <dt>Crews (jobs at the same time)</dt>
      <dd>
        <PlusMinus value={crews} onChange={save} step={1} min={1} max={20} label="Crews" disabled={saving} />
      </dd>
    </div>
  );
}
