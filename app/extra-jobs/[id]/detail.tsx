"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BigButton, CHEER, Card, EmptyState, ErrorBox, Screen, Sheet, SkeletonList, StatusPill, TextAreaField, friendlyDate, showToast } from "@/app/ui";
import { EXTRA_JOB_COMMISSION_PERCENT, SOURCE_LABEL, STATUS_LABEL, dayLabel, money, type ExtraJob } from "@/lib/extraJobs";
import styles from "../extra-jobs.module.css";

type State = "loading" | "off" | "missing" | "failed" | "ready";

export default function ExtraJobDetail({ id }: { id: string }) {
  const [state, setState] = useState<State>("loading");
  const [job, setJob] = useState<ExtraJob | null>(null);
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/extra-jobs?id=${encodeURIComponent(id)}`, { cache: "no-store" });
      if (response.status === 404) return setState("missing");
      const body = (await response.json()) as { success?: boolean; ready?: boolean; job?: ExtraJob };
      if (!response.ok || body.success !== true) throw new Error("failed");
      if (body.ready !== true) return setState("off");
      setJob(body.job ?? null);
      setState(body.job ? "ready" : "missing");
    } catch {
      setState("failed");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addPhotos(files: FileList | null) {
    if (!files || files.length === 0 || !job) return;
    setError("");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.set("jobId", job.id);
        form.set("file", file);
        const response = await fetch("/api/extra-jobs/photos", { method: "POST", body: form });
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; job?: ExtraJob };
        if (!response.ok || body.success !== true || !body.job) throw new Error(body.error ?? "The photo did not upload. Try again.");
        setJob(body.job);
      }
      showToast("Photo added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The photo did not upload. Try again.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function post(body: Record<string, unknown>): Promise<{ job?: ExtraJob; emailed?: boolean }> {
    const response = await fetch("/api/extra-jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; job?: ExtraJob; emailed?: boolean };
    if (!response.ok || data.success !== true) throw new Error(data.error ?? "That did not save. Try again.");
    return data;
  }

  async function markDone() {
    if (!job) return;
    setError("");
    setBusy(true);
    try {
      const data = await post({ action: "done", id: job.id, note });
      if (data.job) setJob(data.job);
      showToast(data.emailed === false ? "Done. The email to the office did not go out." : CHEER.logged, data.emailed === false ? "bad" : "good");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function cancelJob() {
    if (!job) return;
    if (!reason.trim()) return setReasonError("Write why it is cancelled.");
    setReasonError("");
    setBusy(true);
    try {
      const data = await post({ action: "cancel", id: job.id, reason });
      if (data.job) setJob(data.job);
      setCancelling(false);
      showToast(data.emailed === false ? "Cancelled. The email to the office did not go out." : "Cancelled. The office was told.", data.emailed === false ? "bad" : "good");
    } catch (err) {
      setReasonError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!job) return;
    setError("");
    setBusy(true);
    try {
      await post({ action: "resendEmail", id: job.id });
      await load();
      showToast("The office was told.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The email did not go out.");
    } finally {
      setBusy(false);
    }
  }

  const done = job?.status === "done";
  const cancelled = job?.status === "cancelled";
  const setUp = job?.status === "setup";
  const emailMissing = job ? (done ? !job.doneEmailed : cancelled ? !job.cancelEmailed : !job.setupEmailed) : false;

  return (
    <Screen title={job ? `Extra job ${job.jobNumber}` : "Extra job"} backHref="/extra-jobs">
      {state === "loading" ? (
        <SkeletonList rows={3} />
      ) : state === "off" ? (
        <EmptyState title="Not set up here yet" text="Extra Jobs works once this database has its tables." />
      ) : state === "missing" ? (
        <EmptyState title="That extra job was not found" text="It may have been opened from an old link." action={<BigButton kind="second" href="/extra-jobs">All extra jobs</BigButton>} />
      ) : state === "failed" || !job ? (
        <ErrorBox title="The extra job did not load." onRetry={() => void load()} />
      ) : (
        <>
          <Card title={job.accountName} right={<StatusPill kind={done ? "done" : cancelled ? "off" : "waiting"}>{STATUS_LABEL[job.status]}</StatusPill>}>
            {cancelled ? (
              <p className={styles.cancelled} style={{ margin: "0 0 14px" }}>
                Cancelled by {job.cancelledBy}, {friendlyDate(job.cancelledAt)}. Reason: {job.cancelReason}
              </p>
            ) : null}
            <dl className={styles.facts}>
              <div className={styles.wide}>
                <dt>The job</dt>
                <dd>{job.description}</dd>
              </div>
              <div>
                <dt>Date</dt>
                <dd>{dayLabel(job.jobDate)}</dd>
              </div>
              <div>
                <dt>Customer price</dt>
                <dd>{money(job.customerPrice)}</dd>
              </div>
              <div>
                <dt>Sub</dt>
                <dd>{job.subName}</dd>
              </div>
              <div>
                <dt>Sub pay</dt>
                <dd>{money(job.subPay)}</dd>
              </div>
              <div>
                <dt>Came in by</dt>
                <dd>{SOURCE_LABEL[job.source]}</dd>
              </div>
              <div>
                <dt>Set up by</dt>
                <dd>
                  {job.createdBy}, {friendlyDate(job.createdAt)}
                </dd>
              </div>
              <div>
                <dt>Sold by</dt>
                <dd>
                  {job.soldBy} ({EXTRA_JOB_COMMISSION_PERCENT}% one-time)
                </dd>
              </div>
              {done ? (
                <div>
                  <dt>Done</dt>
                  <dd>
                    {job.doneBy}, {friendlyDate(job.doneAt)}
                  </dd>
                </div>
              ) : null}
              {job.doneNote ? (
                <div className={styles.wide}>
                  <dt>Note</dt>
                  <dd>{job.doneNote}</dd>
                </div>
              ) : null}
            </dl>
            {job.editedAt ? (
              <p className="ui-muted" style={{ marginTop: 12 }}>
                Last changed by {job.editedBy}, {friendlyDate(job.editedAt)}.
              </p>
            ) : null}
            {job.accountId ? (
              <p style={{ marginTop: 12 }}>
                <Link className="ui-link" href={`/accounts/${encodeURIComponent(job.accountId)}`}>
                  Open the account
                </Link>
              </p>
            ) : null}
            {setUp ? (
              <div className={styles.buttonRow} style={{ marginTop: 14 }}>
                <BigButton kind="second" href={`/extra-jobs/${job.id}/edit`}>
                  Change
                </BigButton>
                <BigButton
                  kind="danger"
                  disabled={busy || uploading}
                  onClick={() => {
                    setReason("");
                    setReasonError("");
                    setCancelling(true);
                  }}
                >
                  Cancel job
                </BigButton>
              </div>
            ) : null}
          </Card>

          {emailMissing ? (
            <div className={styles.warn} role="status">
              <p style={{ margin: "0 0 8px" }}>The email to the office did not go out for this step.</p>
              <BigButton kind="second" disabled={busy} onClick={() => void resend()}>
                Send the email again
              </BigButton>
            </div>
          ) : null}

          <Card title="Work order">
            <p className="ui-card-text">The sub copy has no customer price. The office copy has everything.</p>
            <div className={styles.buttonRow} style={{ marginTop: 12 }}>
              <BigButton kind="second" href={`/extra-jobs/${job.id}/work-order?copy=sub`}>
                Sub copy
              </BigButton>
              <BigButton kind="second" href={`/extra-jobs/${job.id}/work-order?copy=office`}>
                Office copy
              </BigButton>
            </div>
          </Card>

          {cancelled ? null : (
          <Card title={done ? "After photos" : "When the job is done"}>
            {done ? null : <p className="ui-card-text">Add at least one after photo, then tap Done. The office is told it is ready to invoice.</p>}
            {job.photos.length > 0 ? (
              <div className={styles.photos} style={{ marginTop: 12 }}>
                {job.photos.map((photo, index) => (
                  <a key={photo.id} className={styles.photo} href={photo.url} target="_blank" rel="noreferrer">
                    {/* Blob photos are shown as they are; next/image is not set up for that host. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt={`After photo ${index + 1}`} loading="lazy" />
                  </a>
                ))}
              </div>
            ) : done ? (
              <p className="ui-muted">No photos.</p>
            ) : null}

            <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(event) => void addPhotos(event.target.files)} />
            <div className="ui-stack" style={{ marginTop: 12 }}>
              <div>
                <BigButton kind="second" icon="camera" busy={uploading} busyLabel="Adding the photo…" disabled={busy} onClick={() => fileInput.current?.click()}>
                  {job.photos.length === 0 ? "Add after photo" : "Add another photo"}
                </BigButton>
              </div>
              {done ? null : (
                <>
                  <TextAreaField label="Note for the office" optional rows={2} maxLength={1000} value={note} disabled={busy} onChange={(event) => setNote(event.target.value)} />
                  <div>
                    <BigButton icon="check" busy={busy} busyLabel="Saving…" disabled={uploading || job.photos.length === 0} onClick={() => void markDone()}>
                      Done
                    </BigButton>
                  </div>
                  {job.photos.length === 0 ? <p className="ui-muted">The Done button turns on after the first photo.</p> : null}
                </>
              )}
            </div>
          </Card>
          )}

          {error ? <ErrorBox title="Not saved yet." text={error} /> : null}
        </>
      )}

      <Sheet
        open={cancelling}
        title="Cancel this job?"
        text="The job moves to Cancelled, its Sale is cancelled too, and the office is told. This cannot be undone."
        onClose={() => setCancelling(false)}
        closeLabel="Keep the job"
        busy={busy}
        actions={
          <BigButton kind="danger" busy={busy} busyLabel="Cancelling…" onClick={() => void cancelJob()}>
            Cancel job
          </BigButton>
        }
      >
        <TextAreaField label="Why is it cancelled?" rows={3} maxLength={1000} value={reason} error={reasonError || undefined} disabled={busy} onChange={(event) => setReason(event.target.value)} />
      </Sheet>
    </Screen>
  );
}
