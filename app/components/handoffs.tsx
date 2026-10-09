"use client";

// Handoffs on screen: the pieces every handoff screen shares (Dashboard "My
// work", the New accounts board, Account Updates, Supply Orders).
//   useHandoffs()        loads what is waiting on whom
//   <HandoffCard>        one card: what it is, where it is, what to do next
//   <StepProgress>       "Step 3 of 7" with a bar
//   <GuideLines>         "Now: ..." and "Next: ..." in plain words
//   advanceWithUndo()    "Done ✓ — sent to Office" with Undo for 5 seconds
//   <AcceptedEstimate>   the big "Add accepted estimate" button and its sheet
// The rules (steps, owners, late) are in lib/handoffs.ts.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BigButton, CHEER, ErrorBox, Field, Sheet, StatusPill, Stepper, showToast, undoable } from "@/app/ui";
import {
  KIND_LABEL,
  handoffHref,
  isLate,
  ownerLabel,
  stepOf,
  waitingText,
  type HandoffItem,
  type HandoffKind,
  type HandoffMe,
  type HandoffSettings,
} from "@/lib/handoffs";

export type HandoffsState = {
  /** "off" = this database does not have the handoff tables yet: screens hide the feature. */
  state: "loading" | "off" | "ready" | "failed";
  settings: HandoffSettings | null;
  me: HandoffMe;
  items: HandoffItem[];
  reload: () => Promise<void>;
};

const NOBODY: HandoffMe = { name: "", role: "", isOffice: false };

export async function postHandoff<T = { success?: boolean; error?: string; item?: HandoffItem }>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/handoffs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
  if (!response.ok || data.success === false) throw new Error(data.error || "That did not save. Try again.");
  return data as T;
}

export function useHandoffs(): HandoffsState {
  const [state, setState] = useState<HandoffsState["state"]>("loading");
  const [settings, setSettings] = useState<HandoffSettings | null>(null);
  const [me, setMe] = useState<HandoffMe>(NOBODY);
  const [items, setItems] = useState<HandoffItem[]>([]);
  const alive = useRef(true);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/handoffs", { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; ready?: boolean; settings?: HandoffSettings; me?: HandoffMe; items?: HandoffItem[] };
      if (!alive.current) return;
      if (!response.ok || data.success === false) {
        setState("failed");
        return;
      }
      if (!data.ready) {
        setState("off");
        return;
      }
      setSettings(data.settings ?? null);
      setMe(data.me ?? NOBODY);
      setItems(data.items ?? []);
      setState("ready");
    } catch {
      if (alive.current) setState("failed");
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    // The first load: fetches, then sets state when the answer arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
    return () => {
      alive.current = false;
    };
  }, [reload]);

  return { state, settings, me, items, reload };
}

/* ---------- words ---------- */

/** "Done ✓ — sent to Office" (or "— finished" on the last step). */
export function sentToText(item: Pick<HandoffItem, "kind" | "manager">, toStep: string, settings: HandoffSettings | null): string {
  const { step } = stepOf({ kind: item.kind, step: toStep }, settings);
  const owner = step ? ownerLabel(step.owner, item) : "";
  return owner ? `Done ✓ — sent to ${owner}` : "Done ✓ — finished";
}

/**
 * The tap on a step's main button: says "Done ✓ — sent to [next owner]" with
 * Undo for 5 seconds, and only then saves (`run`). `onOptimistic` lets the
 * screen show the move at once; `onUndo` puts it back.
 */
export function advanceWithUndo(input: {
  item: Pick<HandoffItem, "kind" | "manager">;
  toStep: string;
  settings: HandoffSettings | null;
  run: () => Promise<void>;
  onOptimistic?: () => void;
  onUndo?: () => void;
  onSaved?: () => void;
}) {
  input.onOptimistic?.();
  undoable({
    message: sentToText(input.item, input.toStep, input.settings),
    undoneMessage: "Undone. Nothing was changed.",
    onUndo: input.onUndo,
    run: async () => {
      try {
        await input.run();
        input.onSaved?.();
      } catch (error) {
        input.onUndo?.();
        showToast(error instanceof Error ? error.message : "That did not save. Try again.", "bad");
      }
    },
  });
}

/* ---------- small pieces ---------- */

export function StepProgress({ item, settings }: { item: Pick<HandoffItem, "kind" | "step">; settings: HandoffSettings | null }) {
  const { steps, index, step } = stepOf(item, settings);
  if (index < 0 || !step) return null;
  // A new account has 7 sections to do; "Done" after them is not a step of its own.
  const total = item.kind === "account" ? steps.length - 1 : steps.length;
  if (index >= total) return null;
  return <Stepper step={index + 1} total={total} label={step.label} />;
}

/** What happens now and who is next, in plain words. */
export function GuideLines({ item, settings }: { item: HandoffItem; settings: HandoffSettings | null }) {
  const { step, next } = stepOf(item, settings);
  if (!step) return null;
  if (!step.owner) {
    return (
      <p className="ui-guide ui-guide-done">
        Done ✓{item.lastBy ? ` by ${item.lastBy}` : ""}
        {item.lastAt ? `, ${shortDay(item.lastAt)}` : ""}
        {item.lastNote ? ` — ${item.lastNote}` : ""}
      </p>
    );
  }
  const nextOwner = next ? ownerLabel(next.owner, item) : "";
  return (
    <div className="ui-guide">
      <p>
        <span className="ui-strong">Now:</span> {step.todo}
      </p>
      {next ? (
        <p className="ui-muted">
          <span className="ui-strong">Next:</span> {nextOwner ? `${nextOwner} — ${next.label}` : `${next.label}. That is the last step.`}
        </p>
      ) : null}
    </div>
  );
}

export function shortDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Red "3 days late" or amber "Waiting 1 day": color + icon + words. */
export function WaitingPill({ item, settings }: { item: HandoffItem; settings: HandoffSettings | null }) {
  if (item.doneAt) return <StatusPill kind="done">Done</StatusPill>;
  const text = waitingText(item, settings);
  if (!text) return null;
  return <StatusPill kind={isLate(item, settings) ? "needs-you" : "waiting"}>{text}</StatusPill>;
}

/* ---------- the card ---------- */

/**
 * One handoff as a card. With `href` the whole card is one link (My work, the
 * board). With `children` the card holds its own main button instead.
 */
export function HandoffCard({
  item,
  settings,
  href,
  showKind = false,
  detail,
  children,
  ...rest
}: {
  item: HandoffItem;
  settings: HandoffSettings | null;
  href?: string;
  showKind?: boolean;
  /** One line under the title (what was ordered, the update's note...). */
  detail?: string;
  children?: ReactNode;
  "data-tip"?: string;
}) {
  const late = isLate(item, settings);
  const { step } = stepOf(item, settings);
  const owner = step ? ownerLabel(step.owner, item) : "";
  const body = (
    <>
      <span className="ui-acct-name">{item.title || item.accountName || KIND_LABEL[item.kind]}</span>
      <span className="ui-actions-row">
        {showKind ? <StatusPill kind="off">{KIND_LABEL[item.kind]}</StatusPill> : null}
        <WaitingPill item={item} settings={settings} />
      </span>
      {detail ? <span className="ui-acct-line ui-clamp">{detail}</span> : null}
      <StepProgress item={item} settings={settings} />
      {owner ? (
        <span className="ui-acct-line">
          Waiting on <span className="ui-strong">{owner}</span>
        </span>
      ) : null}
      <GuideLines item={item} settings={settings} />
    </>
  );
  const className = `ui-acct ${late ? "ui-acct-problem" : ""}`.trim();
  if (href) {
    return (
      <Link href={href} className={`${className} ui-acct-link`} {...rest}>
        {body}
      </Link>
    );
  }
  return (
    <article className={className} {...rest}>
      {body}
      {children ? <div className="ui-acct-buttons">{children}</div> : null}
    </article>
  );
}

export function handoffCardHref(item: HandoffItem): string {
  return handoffHref(item);
}

/* ---------- Add accepted estimate ---------- */

const todayIso = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

/**
 * The big "Add accepted estimate" button on a new account. Take a photo or
 * pick a PDF, confirm the day it was accepted, and the account goes on the
 * New accounts board with its first step.
 */
export function AcceptedEstimate({
  accountId,
  accountName,
  manager,
  current,
  onSaved,
}: {
  accountId: string;
  accountName: string;
  manager: string;
  /** The account's handoff when it is already on the board. */
  current: HandoffItem | null;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [acceptedOn, setAcceptedOn] = useState(todayIso());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const hasEstimate = Boolean(current?.data.estimateUrl);

  function openSheet() {
    setFile(null);
    setError("");
    setAcceptedOn(current?.data.acceptedOn || todayIso());
    setOpen(true);
  }

  async function save() {
    setError("");
    if (!file && !hasEstimate && !current) {
      setError("Take a photo of the estimate or choose its PDF. No file? Tap \"Start without the file\".");
      return;
    }
    await send(file);
  }

  async function send(upload: File | null) {
    setSaving(true);
    try {
      let estimateUrl = "";
      let estimateName = "";
      if (upload) {
        const form = new FormData();
        form.append("file", upload);
        const response = await fetch("/api/handoffs/estimate", { method: "POST", body: form });
        const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; url?: string; name?: string };
        if (!response.ok || !data.success || !data.url) throw new Error(data.error || "The estimate did not upload. Try again.");
        estimateUrl = data.url;
        estimateName = data.name ?? upload.name;
      }
      await postHandoff({ action: "startAccount", accountId, accountName, manager, acceptedOn, estimateUrl, estimateName });
      setOpen(false);
      showToast(CHEER.logged);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That did not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {hasEstimate ? (
        <div className="ui-more-actions">
          <a className="ui-btn ui-btn-second" href={current?.data.estimateUrl} target="_blank" rel="noopener noreferrer">
            See the accepted estimate
          </a>
          <BigButton kind="second" onClick={openSheet}>
            Replace the estimate
          </BigButton>
        </div>
      ) : (
        <div className="ui-stack">
          <BigButton icon="camera" onClick={openSheet} data-tip="estimate">
            Add accepted estimate
          </BigButton>
          <p className="ui-cheer">{CHEER.estimate}</p>
        </div>
      )}

      <Sheet
        open={open}
        title="Accepted estimate"
        text={`${accountName}. Take a photo of the signed estimate, or choose its PDF.`}
        onClose={() => {
          if (!saving) setOpen(false);
        }}
        busy={saving}
        actions={
          <BigButton busy={saving} busyLabel="Saving…" onClick={() => void save()}>
            {file ? "Save estimate" : current ? "Save" : "Save estimate"}
          </BigButton>
        }
      >
        <div className="ui-field">
          <label className="ui-label" htmlFor="estimate-file">
            Photo or PDF of the estimate
          </label>
          <input
            id="estimate-file"
            type="file"
            accept="image/*,application/pdf"
            className="ui-input"
            disabled={saving}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <p className="ui-hint">{file ? `Chosen: ${file.name}` : "On a phone this opens the camera or your files. 10MB or smaller."}</p>
        </div>
        <Field
          label="Day the customer accepted"
          type="date"
          hint="Every step's due date is counted from this day."
          value={acceptedOn}
          max={todayIso()}
          onChange={(event) => setAcceptedOn(event.target.value)}
          disabled={saving}
        />
        {!current && !file ? (
          <BigButton kind="quiet" disabled={saving} onClick={() => void send(null)}>
            Start without the file
          </BigButton>
        ) : null}
        {error ? <ErrorBox title="Not saved yet." text={error} /> : null}
      </Sheet>
    </>
  );
}

export type { HandoffItem, HandoffKind, HandoffMe, HandoffSettings };
