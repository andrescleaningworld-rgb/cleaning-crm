"use client";

// The printed "Complaint Review" for a meeting with a sub (Complaints page ->
// Print, and the sub's page -> Recent Complaints -> Print for review). It is
// handed to the sub, so it shows only ReviewComplaint plus the address, the
// times and the photos (POST /api/complaints/review): never notes, the
// manager, money, or score.
//
// `active` true: the extra facts load, the first photos are fetched, then
// the sheet prints (PrintSheet, the app's one print rule). Letter, portrait;
// "Cleaning World Inc. — Page X of Y" at the foot of each page (globals.css,
// @page complaint-review).

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import PrintSheet from "./print-sheet";
import { showToast } from "@/app/ui";
import { dayText, isClosedStatus, localIso, parseDay, problemAreas, rangeText, reportedText, type ReviewComplaint } from "@/lib/complaintReview";

type Facts = { createdAt: string; address: string; photos: string[]; resolvedAt: string };

const LOGO = "/logo-CW-single.png";
const MAX_PHOTOS = 3;
const PHOTO_WAIT_MS = 8000;

/** A Drive link as a picture link (the complaint page does the same). */
function pictureUrl(url: string): string {
  const fileId = /\/file\/d\/([^/]+)/.exec(url)?.[1] ?? /[?&]id=([^&]+)/.exec(url)?.[1];
  return fileId && /drive\.google\.com/.test(url) ? `https://drive.google.com/uc?export=view&id=${fileId}` : url;
}

/** Fetch the pictures first, so they are on paper (at most PHOTO_WAIT_MS). */
function preload(urls: string[]): Promise<void> {
  if (urls.length === 0) return Promise.resolve();
  const each = urls.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new window.Image();
        img.onload = () => resolve();
        img.onerror = () => resolve();
        img.src = url;
      })
  );
  return Promise.race([Promise.all(each).then(() => undefined), new Promise<void>((resolve) => window.setTimeout(resolve, PHOTO_WAIT_MS))]);
}

/** When it was filed: the day and time it was entered, or the day alone when it was entered on another day (an older, imported one). */
function filedMoment(complaint: ReviewComplaint, facts: Facts | undefined): { text: string; start: Date | null } {
  const day = parseDay(complaint.date);
  const created = facts?.createdAt ? new Date(facts.createdAt) : null;
  if (created && !Number.isNaN(created.getTime()) && (!day || localIso(created) === localIso(day))) {
    return {
      text: created.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }),
      start: created,
    };
  }
  return { text: dayText(complaint.date) || "Date not recorded", start: day };
}

function howLong(start: Date | null, end: Date | null): string {
  if (!start || !end) return "";
  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (hours < 0) return "";
  if (hours < 1) return "under 1 hour";
  if (hours < 24) return `${Math.round(hours)} hour${Math.round(hours) === 1 ? "" : "s"}`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

export default function ComplaintReviewPrint({
  active,
  onDone,
  subName,
  from,
  to,
  complaints,
  note,
}: {
  active: boolean;
  onDone: () => void;
  /** The sub's name, or "All subs". */
  subName: string;
  /** The days covered (YYYY-MM-DD, "" = open). */
  from: string;
  to: string;
  complaints: ReviewComplaint[];
  /** Other filters in words, e.g. "Status: Open" (optional). */
  note?: string;
}) {
  const [facts, setFacts] = useState<Record<string, Facts>>({});
  const [ready, setReady] = useState(false);

  // By account, then oldest first: the same problem at the same place reads as one run.
  const sorted = useMemo(
    () =>
      [...complaints].sort(
        (a, b) => a.accountName.localeCompare(b.accountName) || (parseDay(a.date)?.getTime() ?? 0) - (parseDay(b.date)?.getTime() ?? 0)
      ),
    [complaints]
  );

  useEffect(() => {
    if (!active) return;
    let alive = true;
    showToast("Getting the report ready…");
    void (async () => {
      let loaded: Record<string, Facts> = {};
      try {
        const response = await fetch("/api/complaints/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keys: sorted.map((c) => c.key).filter(Boolean) }),
        });
        const data = (await response.json()) as { success?: boolean; facts?: Record<string, Facts> };
        if (response.ok && data.success !== false && data.facts) loaded = data.facts;
        else showToast("Addresses and photos did not load. It prints without them.");
      } catch {
        showToast("Addresses and photos did not load. It prints without them.");
      }
      if (!alive) return;
      setFacts(loaded);
      await preload([LOGO, ...sorted.flatMap((c) => (loaded[c.key]?.photos ?? []).slice(0, MAX_PHOTOS).map(pictureUrl))]);
      if (alive) setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [active, sorted]);

  const done = useCallback(() => {
    setReady(false);
    onDone();
  }, [onDone]);

  const closed = sorted.filter((c) => isClosedStatus(c.status)).length;
  const earliest = sorted.map((c) => parseDay(c.date)).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime())[0];

  // Summary: each account's count, and the problem areas named 2 times or more there.
  const byAccount = useMemo(() => {
    const map = new Map<string, { count: number; areas: Map<string, number> }>();
    for (const complaint of sorted) {
      const name = complaint.accountName || "No account";
      const entry = map.get(name) ?? { count: 0, areas: new Map<string, number>() };
      entry.count += 1;
      for (const area of problemAreas(complaint)) entry.areas.set(area, (entry.areas.get(area) ?? 0) + 1);
      map.set(name, entry);
    }
    return [...map.entries()].map(([name, entry]) => ({
      name,
      count: entry.count,
      repeated: [...entry.areas.entries()].filter(([area, n]) => n >= 2 && area !== "Other").sort((a, b) => b[1] - a[1]),
    }));
  }, [sorted]);

  return (
    <PrintSheet active={active && ready} onDone={done}>
      <div className="cw-review">
        <header className="cw-review-head">
          {/* eager: the sheet is hidden on screen, and a lazy picture there is never fetched before the print window opens. */}
          <Image src={LOGO} alt="" width={56} height={56} unoptimized loading="eager" className="cw-review-logo" />
          <div>
            <p className="cw-review-company">Cleaning World</p>
            <h1>Complaint Review — {subName}</h1>
            <p>Covers: {rangeText(from, to, earliest ? localIso(earliest) : "")}</p>
            {note ? <p>{note}</p> : null}
            <p>Printed: {dayText(localIso(new Date()))}</p>
          </div>
        </header>

        <section className="cw-review-summary">
          <h2>Summary</h2>
          <p className="cw-review-total">
            {sorted.length} complaint{sorted.length === 1 ? "" : "s"} · Open: {sorted.length - closed} · Closed: {closed}
          </p>
          {byAccount.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Complaints</th>
                  <th>Repeated problem areas</th>
                </tr>
              </thead>
              <tbody>
                {byAccount.map((row) => (
                  <tr key={row.name}>
                    <td>{row.name}</td>
                    <td>{row.count}</td>
                    <td>{row.repeated.length > 0 ? row.repeated.map(([area, n]) => `${area} — ${n} times`).join("; ") : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>No complaints in this range.</p>
          )}
        </section>

        {sorted.map((complaint, index) => {
          const f = facts[complaint.key];
          const filed = filedMoment(complaint, f);
          const reported = reportedText(complaint.reportedBy);
          const resolvedAt = f?.resolvedAt ? new Date(f.resolvedAt) : null;
          const waitingReview = complaint.status.toLowerCase().startsWith("resolved by sub");
          const took = howLong(filed.start, resolvedAt);
          const photos = f?.photos ?? [];
          return (
            <article key={`${complaint.key}-${index}`} className="cw-review-block">
              <div className="cw-review-block-head">
                <h3>{complaint.accountName || "No account"}</h3>
                <span>Filed {filed.text}</span>
              </div>
              {f?.address ? <p className="cw-review-muted">{f.address}</p> : null}
              <p>
                <strong>Reported by:</strong> {reported.who} · <strong>How:</strong> {reported.how}
                {complaint.type ? (
                  <>
                    {" "}
                    · <strong>Type:</strong> {complaint.type}
                  </>
                ) : null}
              </p>
              <p className="cw-review-issue">{complaint.issue || "No description"}</p>
              <p>
                <strong>Priority:</strong> {complaint.priority || "Not set"} · <strong>Validity:</strong> {complaint.validity} · <strong>Status:</strong> {complaint.status}
              </p>
              {isClosedStatus(complaint.status) || waitingReview || resolvedAt ? (
                <p>
                  <strong>{waitingReview ? "Marked fixed by the team:" : "Resolved:"}</strong> {resolvedAt ? dayText(localIso(resolvedAt)) : "date not recorded"}
                  {took ? ` · took ${took}` : ""}
                  {waitingReview ? " (waiting for office review)" : ""}
                  {complaint.resolution ? (
                    <>
                      <br />
                      <strong>How:</strong> {complaint.resolution}
                    </>
                  ) : null}
                </p>
              ) : (
                <p>
                  <strong>Resolved:</strong> Not resolved yet
                </p>
              )}
              {photos.length > 0 ? (
                <div className="cw-review-photos">
                  {photos.slice(0, MAX_PHOTOS).map((url, photoIndex) => (
                    <Image key={`${url}-${photoIndex}`} src={pictureUrl(url)} alt={`Photo ${photoIndex + 1}`} width={130} height={96} unoptimized loading="eager" />
                  ))}
                  {photos.length > MAX_PHOTOS ? <span>+{photos.length - MAX_PHOTOS} more</span> : null}
                </div>
              ) : null}
            </article>
          );
        })}

        <p className="cw-review-end">
          Total: {sorted.length} · Open: {sorted.length - closed} · Closed: {closed}
        </p>
      </div>
    </PrintSheet>
  );
}
