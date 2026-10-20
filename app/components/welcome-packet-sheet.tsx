"use client";

// "Send Customer Welcome Packet" (the account page and the Add Account screen): the
// customer's email (editable), where the copy and the answers go, the packet
// exactly as the email shows it, and one big Send button. The server builds
// and sends it (app/api/accounts/[id]/welcome-packet); a missing manager
// phone or customer email is said here in plain words and nothing is sent.

import { useEffect, useState } from "react";
import { BigButton, ErrorBox, Field, Sheet, showToast } from "@/app/ui";

type Preview = {
  to: string;
  cc: string;
  replyTo: string;
  managerName: string;
  managerHasEmail: boolean;
  subject: string;
  managerProblem: string;
  html: string;
  lastSentAt: string | null;
  portalAccessOn: boolean;
};

/** "Oct 16, 2026" in New York time. */
export function welcomeSentLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });
}

function emailProblem(to: string): string {
  if (!to.trim()) return "Type the customer's email.";
  if (!/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(to.trim())) return "That is not an email address.";
  return "";
}

export default function WelcomePacketSheet({
  open,
  accountId,
  accountName,
  onClose,
  onSent,
}: {
  open: boolean;
  accountId: string;
  accountName: string;
  onClose: () => void;
  onSent?: (sentAt: string) => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadError, setLoadError] = useState("");
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  // Each opening loads the packet fresh (the manager or the email may have just been fixed).
  useEffect(() => {
    if (!open || !accountId) return;
    let alive = true;
    setPreview(null);
    setLoadError("");
    setSendError("");
    fetch(`/api/accounts/${encodeURIComponent(accountId)}/welcome-packet`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: Partial<Preview> & { success?: boolean; error?: string }) => {
        if (!alive) return;
        if (!data.success) {
          setLoadError(data.error || "Could not load the welcome packet.");
          return;
        }
        setPreview(data as Preview);
        setTo(data.to ?? "");
      })
      .catch(() => alive && setLoadError("Could not load the welcome packet."));
    return () => {
      alive = false;
    };
  }, [open, accountId]);

  const toProblem = emailProblem(to);
  const blocked = !preview || Boolean(preview.managerProblem) || Boolean(toProblem);

  async function send() {
    if (blocked) return;
    setSending(true);
    setSendError("");
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/welcome-packet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; sentTo?: string; sentAt?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "The packet was not sent. Try again.");
      showToast(`Welcome packet sent to ${data.sentTo ?? to.trim()} ✓`);
      onSent?.(data.sentAt ?? new Date().toISOString());
      onClose();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The packet was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="Send Customer Welcome Packet"
      text={accountName}
      onClose={onClose}
      busy={sending}
      actions={
        <BigButton busy={sending} busyLabel="Sending…" disabled={blocked} onClick={() => void send()}>
          Send
        </BigButton>
      }
    >
      {loadError ? <ErrorBox title="Could not load the packet" text={loadError} /> : null}
      {!preview && !loadError ? <p className="ui-muted">Loading the packet…</p> : null}
      {preview ? (
        <div className="ui-stack">
          {preview.managerProblem ? <ErrorBox title="Not ready to send" text={preview.managerProblem} /> : null}
          {preview.lastSentAt ? <p className="ui-muted">Already sent {welcomeSentLabel(preview.lastSentAt)}. Sending again sends a new copy.</p> : null}
          {!preview.portalAccessOn ? (
            <p className="ui-muted">
              Portal access is OFF for this account, so the portal link in the packet will not let the customer in yet. Turn it on (Portal access on this page) before or after you send.
            </p>
          ) : null}
          <Field
            label="To (customer email)"
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com"
            error={toProblem || undefined}
          />
          <p className="ui-muted">
            Copy to {preview.cc}. When the customer answers, it goes to {preview.replyTo}
            {preview.managerHasEmail ? ` (${preview.managerName})` : preview.managerName ? ` (${preview.managerName} has no email on the Managers list)` : ""}.
            The PDF of the same packet is attached.
          </p>
          <p className="ui-muted">Subject: {preview.subject}</p>
          {sendError ? <ErrorBox title="Not sent" text={sendError} /> : null}
          <iframe
            title="Welcome packet preview"
            srcDoc={preview.html}
            sandbox=""
            style={{ width: "100%", height: 460, border: "1px solid #cbd5e1", borderRadius: 12, background: "#ffffff" }}
          />
        </div>
      ) : null}
    </Sheet>
  );
}
