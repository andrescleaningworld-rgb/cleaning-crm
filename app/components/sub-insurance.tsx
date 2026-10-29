"use client";

// Sub insurance (COI) on the office screens. Server: app/api/sub-insurance
// (lib/pg/sub-insurance.ts). Rules and words: lib/subInsurance.ts.
//
//   InsuranceBadge      the red "Insurance expired" pill (and yellow
//                       "expiring" where asked) next to a sub's name
//   useInsuranceMap     every sub's insurance, read once per page
//   SubInsuranceCard    on a sub's page: the date, the file, Upload COI, and
//                       Approve / Reject for one sent from the portal
//   InsuranceCenter     Sub Center -> Insurance: waiting for approval, then
//                       expiring / expired

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BigButton, Card, EmptyState, ErrorBox, Field, StatusPill, TextAreaField, showToast } from "@/app/ui";
import { photoProblemText, prepareDocOrPhoto, readUploadReply } from "@/lib/imageResize";
import { INSURANCE_BADGE, findInsurance, niceDay, type CoiDoc, type SubInsurance } from "@/lib/subInsurance";

/* ---------- reading ---------- */

type ListReply = { success?: boolean; ready?: boolean; list?: SubInsurance[]; pending?: Pending[]; portalOn?: boolean; error?: string };
type Pending = CoiDoc & { subId: string; subName: string; currentExpiresOn: string };

let cached: Promise<ListReply> | null = null;
const listeners = new Set<() => void>();

function loadList(fresh = false): Promise<ListReply> {
  if (!cached || fresh) {
    cached = fetch("/api/sub-insurance", { cache: "no-store" })
      .then((response) => response.json() as Promise<ListReply>)
      .catch(() => ({ success: false }) as ListReply);
  }
  return cached;
}

/** After a change: every screen reads again. */
export function insuranceChanged(): void {
  void loadList(true).then(() => listeners.forEach((listener) => listener()));
}

/** Every sub's insurance, found by any id or name a screen has (lib/subInsurance.ts findInsurance). */
export function useInsuranceMap(): Map<string, SubInsurance> {
  const [map, setMap] = useState<Map<string, SubInsurance>>(new Map());
  useEffect(() => {
    let alive = true;
    const read = () =>
      void loadList().then((reply) => {
        if (!alive) return;
        const next = new Map<string, SubInsurance>();
        for (const sub of reply.list ?? []) for (const key of sub.keys) if (!next.has(key)) next.set(key, sub);
        setMap(next);
      });
    read();
    listeners.add(read);
    return () => {
      alive = false;
      listeners.delete(read);
    };
  }, []);
  return map;
}

/** The pill for one sub record: red when expired; yellow when expiring, only with showSoon. Nothing otherwise. */
export function InsuranceBadge({ map, sub, showSoon = false }: { map: Map<string, SubInsurance>; sub: Record<string, unknown>; showSoon?: boolean }) {
  const found = findInsurance(map, sub);
  if (!found) return null;
  if (found.state === "expired") return <StatusPill kind="needs-you">{INSURANCE_BADGE.expired}</StatusPill>;
  if (found.state === "soon" && showSoon) return <StatusPill kind="waiting">{INSURANCE_BADGE.soon}</StatusPill>;
  return null;
}

/* ---------- uploading ---------- */

/**
 * Sends a certificate. A photo is made small first and a PDF goes as it is
 * (lib/imageResize.ts prepareDocOrPhoto): Vercel takes up to 4.5 MB, and a
 * full-size original is never sent. When it cannot go, `error` says why.
 */
export async function sendCoi(url: string, file: File, expiresOn: string, extra: Record<string, string> = {}): Promise<{ success?: boolean; error?: string }> {
  const prepared = await prepareDocOrPhoto(file);
  if (!prepared.ok) return { success: false, error: photoProblemText(prepared.problem) };
  const form = new FormData();
  form.set("file", prepared.file);
  form.set("expiresOn", expiresOn);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  const reply = await readUploadReply<{ success?: boolean; error?: string }>(await fetch(url, { method: "POST", body: form }));
  return reply.ok ? reply.data : { success: false, error: reply.error };
}

function UploadForm({ subId, onDone, onCancel }: { subId: string; onDone: () => void; onCancel: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [day, setDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!file) return setError("Pick the PDF or take a photo.");
    if (!day) return setError("Enter the expiration date.");
    setBusy(true);
    setError("");
    try {
      const reply = await sendCoi("/api/sub-insurance", file, day, { subId });
      if (!reply.success) throw new Error(reply.error || "That did not save. Try again.");
      showToast("Insurance saved ✓");
      insuranceChanged();
      onDone();
    } catch (err) {
      // A dropped connection throws a TypeError ("Failed to fetch"): say it plainly.
      setError(err instanceof Error && !(err instanceof TypeError) ? err.message : "That did not save: no connection. Check the signal and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ui-stack">
      <label className="ui-btn ui-btn-second" style={{ cursor: "pointer" }}>
        📄 {file ? file.name : "Pick the PDF or take a photo"}
        <input type="file" accept="application/pdf,image/*" hidden onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
      </label>
      <Field label="Expiration date" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      {error ? <p className="ui-field-error">{error}</p> : null}
      <div className="ui-actions-row">
        <BigButton busy={busy} busyLabel="Saving…" onClick={() => void save()}>
          Save
        </BigButton>
        <BigButton kind="second" onClick={onCancel} disabled={busy}>
          Cancel
        </BigButton>
      </div>
    </div>
  );
}

/* ---------- approve / reject one from the portal ---------- */

function ReviewRow({ doc, subName, onDone }: { doc: CoiDoc; subName?: string; onDone: () => void }) {
  const [day, setDay] = useState(doc.expiresOn);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function act(action: "approve" | "reject") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/sub-insurance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: doc.id, expiresOn: day, reason }),
      });
      const reply = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!reply.success) throw new Error(reply.error || "That did not save. Try again.");
      showToast(action === "approve" ? "Approved ✓" : "Rejected. The sub will see why.");
      insuranceChanged();
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="ui-acct">
      {subName ? <span className="ui-acct-name">{subName}</span> : null}
      <span className="ui-acct-line">
        Sent {niceDay(doc.uploadedAt.slice(0, 10))} from the sub portal ·{" "}
        <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ui-link">
          Open the file
        </a>
      </span>
      <Field label="Expiration date (fix it if it is wrong)" type="date" value={day} onChange={(event) => setDay(event.target.value)} />
      {rejecting ? (
        <TextAreaField label="Why? The sub will see this." value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
      ) : null}
      {error ? <p className="ui-field-error">{error}</p> : null}
      <div className="ui-actions-row">
        {rejecting ? (
          <>
            <BigButton kind="second" busy={busy} onClick={() => void act("reject")} disabled={!reason.trim()}>
              Send reject
            </BigButton>
            <BigButton kind="second" onClick={() => setRejecting(false)} disabled={busy}>
              Back
            </BigButton>
          </>
        ) : (
          <>
            <BigButton busy={busy} busyLabel="Saving…" onClick={() => void act("approve")} disabled={!day}>
              ✓ Approve
            </BigButton>
            <BigButton kind="second" onClick={() => setRejecting(true)} disabled={busy}>
              ✕ Reject
            </BigButton>
          </>
        )}
      </div>
    </li>
  );
}

/* ---------- a sub's page ---------- */

export function SubInsuranceCard({ subId, onChanged }: { subId: string; onChanged?: () => void }) {
  const [insurance, setInsurance] = useState<SubInsurance | null>(null);
  const [docs, setDocs] = useState<CoiDoc[]>([]);
  const [ready, setReady] = useState(true);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/sub-insurance?subId=${encodeURIComponent(subId)}`, { cache: "no-store" });
      const reply = (await response.json()) as { success?: boolean; ready?: boolean; insurance?: SubInsurance | null; docs?: CoiDoc[]; error?: string };
      if (!reply.success) throw new Error(reply.error || "Insurance did not load.");
      setInsurance(reply.insurance ?? null);
      setDocs(reply.docs ?? []);
      setReady(reply.ready !== false);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Insurance did not load.");
    }
  }, [subId]);

  useEffect(() => {
    void load();
  }, [load]);

  const changed = () => {
    void load();
    onChanged?.();
  };

  const pending = docs.find((doc) => doc.status === "pending") ?? null;
  const state = insurance?.state ?? "none";
  const kind = state === "expired" ? "needs-you" : state === "soon" ? "waiting" : state === "ok" ? "done" : "off";

  return (
    <Card title="Insurance (COI)">
      {error ? <ErrorBox title="Insurance did not load." text={error} onRetry={() => void load()} /> : null}
      <div className="ui-stack">
        <div className="ui-actions-row">
          <StatusPill kind={kind}>{INSURANCE_BADGE[state]}</StatusPill>
          {insurance?.expiresOn ? <span className="ui-strong">Expires {niceDay(insurance.expiresOn)}</span> : null}
        </div>
        {insurance?.fileUrl ? (
          <a href={insurance.fileUrl} target="_blank" rel="noopener noreferrer" className="ui-link">
            Open the COI
          </a>
        ) : null}
        {pending ? (
          <ul className="ui-acct-list" aria-label="Waiting for approval">
            <ReviewRow doc={pending} onDone={changed} />
          </ul>
        ) : null}
        {!ready ? (
          <p className="ui-muted">Uploading a COI works once the update for it (migration 056) is installed.</p>
        ) : uploading ? (
          <UploadForm
            subId={subId}
            onDone={() => {
              setUploading(false);
              changed();
            }}
            onCancel={() => setUploading(false)}
          />
        ) : (
          <BigButton onClick={() => setUploading(true)}>📄 Upload COI</BigButton>
        )}
        {docs.filter((doc) => doc.status !== "pending").length > 0 ? (
          <details>
            <summary>Earlier COIs</summary>
            <ul className="ui-card-text" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
              {docs
                .filter((doc) => doc.status !== "pending")
                .map((doc) => (
                  <li key={doc.id}>
                    <a href={doc.fileUrl} target="_blank" rel="noopener noreferrer" className="ui-link">
                      Expires {niceDay(doc.expiresOn)}
                    </a>{" "}
                    · {doc.status === "approved" ? "counts now" : doc.status === "rejected" ? `rejected: ${doc.rejectReason}` : "older"} · {doc.source === "sub" ? "from the sub" : `by ${doc.uploadedBy || "the office"}`}
                  </li>
                ))}
            </ul>
          </details>
        ) : null}
      </div>
    </Card>
  );
}

/* ---------- Sub Center -> Insurance ---------- */

export function InsuranceCenter() {
  const [reply, setReply] = useState<ListReply | null>(null);

  const load = useCallback((fresh = false) => void loadList(fresh).then(setReply), []);

  useEffect(() => {
    let alive = true;
    const read = (fresh: boolean) => void loadList(fresh).then((next) => alive && setReply(next));
    read(true);
    const listener = () => read(false);
    listeners.add(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  if (!reply) return <p className="ui-muted">Loading…</p>;
  if (!reply.success) return <ErrorBox title="Insurance did not load." text={reply.error || "Try again."} onRetry={() => load(true)} />;

  const pending = reply.pending ?? [];
  const due = (reply.list ?? [])
    .filter((sub) => sub.state === "soon" || sub.state === "expired")
    .sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  const none = (reply.list ?? []).filter((sub) => sub.state === "none");

  return (
    <div className="ui-stack">
      {pending.length > 0 ? (
        <Card title={`Waiting for approval (${pending.length})`}>
          <ul className="ui-acct-list">
            {pending.map((doc) => (
              <ReviewRow key={doc.id} doc={doc} subName={doc.subName} onDone={() => load(true)} />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Insurance expiring / expired">
        {due.length === 0 ? (
          <EmptyState title="All good" text="No insurance expires in the next 30 days." />
        ) : (
          <ul className="ui-acct-list">
            {due.map((sub) => (
              <li key={sub.subId} className="ui-acct">
                <span className="ui-acct-name">{sub.name}</span>
                {sub.company && sub.company !== sub.name ? <span className="ui-acct-line">{sub.company}</span> : null}
                <span className="ui-actions-row">
                  <StatusPill kind={sub.state === "expired" ? "needs-you" : "waiting"}>{INSURANCE_BADGE[sub.state]}</StatusPill>
                  <span className="ui-strong">
                    {sub.state === "expired" ? "Expired" : "Expires"} {niceDay(sub.expiresOn)}
                  </span>
                </span>
                <Link href={`/subcontractors/${encodeURIComponent(sub.pageId)}`} className="ui-btn ui-btn-main">
                  Open sub
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {none.length > 0 ? (
        <details>
          <summary>No insurance on file ({none.length})</summary>
          <ul className="ui-card-text" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            {none.map((sub) => (
              <li key={sub.subId}>{sub.name}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
