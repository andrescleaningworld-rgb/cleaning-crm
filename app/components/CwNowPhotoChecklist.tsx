"use client";

// The account's CW Now card: the Photo Checklist (lib/photoChecklist.ts).
//   Crew screen   Classic (as before) / Photo Checklist (a photo checks each
//                 item off; works with no signal). Saved right away.
//   Work reports  the last Photo Checklist visits: who, when, done, photos,
//                 photos taken earlier than the visit (⚠️), and per visit
//                 Open PDF (print from it) and Pin to board (the paper opens
//                 the PDF, made fresh).
// API: app/api/crew-link/work-reports. Before migration 085 it says the
// Photo Checklist is not turned on yet.

import { useEffect, useState } from "react";
import { BigButton, Sheet, showToast } from "@/app/ui";
import { SquareTiles, pinRecord, usePinInfo, type BoardSpot } from "@/app/components/pin-to-board";
import type { CrewScreen } from "@/lib/photoChecklist";
import type { WorkReportSummary } from "@/lib/pg/photo-checklist";

type Reply = { success?: boolean; error?: string; ready?: boolean; crewScreen?: CrewScreen; reports?: WorkReportSummary[] };

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const workReportPdfHref = (id: number) => `/api/crew-link/work-reports?id=${id}&pdf=1`;

export default function CwNowPhotoChecklist({
  accountId,
  accountName,
  onScreenChange,
}: {
  accountId: string;
  accountName: string;
  /** The card's checklist editor shows "Photo required?" per item on the Photo Checklist. */
  onScreenChange: (screen: CrewScreen) => void;
}) {
  const [ready, setReady] = useState(true);
  const [screen, setScreen] = useState<CrewScreen>("classic");
  const [reports, setReports] = useState<WorkReportSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pinFor, setPinFor] = useState<WorkReportSummary | null>(null);
  const [pinBusy, setPinBusy] = useState("");
  const { info: pinInfo, reload: reloadPins } = usePinInfo();

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/crew-link/work-reports?accountId=${encodeURIComponent(accountId)}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((reply: Reply) => {
        if (cancelled || !reply.success) return;
        setReady(reply.ready !== false);
        const loaded = reply.crewScreen === "photo" ? "photo" : "classic";
        setScreen(loaded);
        onScreenChange(loaded);
        setReports(reply.reports ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // Loads once per account; onScreenChange is the card's setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);

  async function choose(next: CrewScreen) {
    if (next === screen || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/crew-link/work-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "setCrewScreen", accountId, screen: next }) });
      const reply = (await response.json().catch(() => ({}))) as Reply;
      if (!response.ok || reply.success === false) throw new Error(reply.error || "That did not save.");
      setScreen(next);
      onScreenChange(next);
      showToast(next === "photo" ? "Crew screen: Photo Checklist ✓" : "Crew screen: Classic ✓");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save.");
    } finally {
      setSaving(false);
    }
  }

  async function pin(spot: BoardSpot) {
    if (!pinFor) return;
    setPinBusy(spot.key);
    try {
      await pinRecord({
        type: "report",
        recordId: String(pinFor.id),
        title: `Work report · ${accountName}`,
        accountId,
        accountName,
        square: spot.square,
        box: spot.box,
        forWho: spot.label,
        notes: `${when(pinFor.submittedAt)} · ${pinFor.porterName} · ${pinFor.completedCount} of ${pinFor.totalCount} done · ${pinFor.photoCount} photos`,
      });
      showToast(`Pinned to ${spot.label} ✓`);
      setPinFor(null);
      void reloadPins();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "It was not pinned. Try again.", "bad");
    } finally {
      setPinBusy("");
    }
  }

  const pinned = new Set(pinInfo?.pinned.report ?? []);
  const pinOn = pinInfo?.types.report?.show === true;

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
      <p className="text-base font-black text-slate-900">Crew screen</p>
      {!ready ? (
        <p className="text-sm text-slate-500">The Photo Checklist is not turned on yet (database update 085). Every crew uses the Classic screen.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["classic", "photo"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={screen === option}
                disabled={saving}
                onClick={() => void choose(option)}
                className={`min-h-[64px] rounded-xl px-3 text-left ${screen === option ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"} disabled:opacity-60`}
              >
                <span className="block text-base font-black">{option === "classic" ? "Classic" : "📷 Photo Checklist"}</span>
                <span className={`block text-xs ${screen === option ? "text-blue-100" : "text-slate-500"}`}>
                  {option === "classic" ? "Check boxes, as today" : "A photo checks each item off. Works with no signal."}
                </span>
              </button>
            ))}
          </div>
          {screen === "photo" ? <p className="text-xs text-slate-500">Each item needs a photo unless you set &quot;Photo required? No&quot; under Edit checklist. Each tab is one person&apos;s list (their own link opens on it).</p> : null}
        </>
      )}
      {error ? <p className="text-sm font-bold text-red-700">{error}</p> : null}

      {reports.length > 0 ? (
        <div className="space-y-2 pt-2">
          <p className="text-base font-black text-slate-900">Work reports</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {reports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <span className="min-w-0 text-sm">
                  <span className="block font-black text-slate-900">
                    {when(report.submittedAt)} · {report.porterName}
                  </span>
                  <span className="block text-slate-600">
                    {report.tabName ? `${report.tabName} · ` : ""}
                    {report.completedCount} of {report.totalCount} done · {report.photoCount} photo{report.photoCount === 1 ? "" : "s"}
                    {report.earlyCount > 0 ? <span className="font-bold text-amber-700"> · ⚠️ {report.earlyCount} taken earlier</span> : null}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <a href={workReportPdfHref(report.id)} target="_blank" rel="noopener" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-500">
                    📄 Open PDF
                  </a>
                  {pinOn ? (
                    <button type="button" onClick={() => setPinFor(report)} className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">
                      {pinned.has(String(report.id)) ? "📌 On the board" : "📌 Pin to board"}
                    </button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : screen === "photo" ? (
        <p className="text-sm text-slate-500">No work reports yet. One is made each time the crew taps Finish.</p>
      ) : null}

      {pinInfo ? (
        <Sheet open={Boolean(pinFor)} title="Pin to board" text={pinFor ? `Work report, ${when(pinFor.submittedAt)}. Tap the square it goes in.` : ""} onClose={() => (pinBusy ? undefined : setPinFor(null))} busy={Boolean(pinBusy)}>
          <div className="ui-stack">
            <SquareTiles info={pinInfo} onPick={(spot) => void pin(spot)} disabled={Boolean(pinBusy)} busyKey={pinBusy} />
            <BigButton kind="quiet" disabled={Boolean(pinBusy)} onClick={() => setPinFor(null)}>
              Cancel
            </BigButton>
          </div>
        </Sheet>
      ) : null}
    </div>
  );
}
