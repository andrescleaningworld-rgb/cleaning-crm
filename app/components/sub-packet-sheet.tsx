"use client";

// "Send Sub Packet" (account page): who it goes to (editable), the subject,
// a language switch (English / Español / Português), the packet exactly as
// the sub will get it, and Send / Cancel. Nothing goes out until Send.
// Server: app/api/accounts/[id]/sub-packet.

import { useEffect, useState } from "react";
import { BigButton, ErrorBox, Field, Sheet, showToast } from "@/app/ui";
import { SUB_PACKET_LANGS, type SubPacketLang } from "@/lib/subPacket";

type Preview = { to: string; subName: string; subject: string; html: string; lang: SubPacketLang; problems: string[] };

export default function SubPacketSheet({ open, accountId, accountName, onClose }: { open: boolean; accountId: string; accountName: string; onClose: () => void }) {
  const [lang, setLang] = useState<SubPacketLang>("en");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [to, setTo] = useState("");
  const [loadError, setLoadError] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  // Each opening (and each language) reads the account fresh.
  useEffect(() => {
    if (!open || !accountId) return;
    let alive = true;
    setLoadError("");
    setSendError("");
    fetch(`/api/accounts/${encodeURIComponent(accountId)}/sub-packet?lang=${lang}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((data: { success?: boolean; error?: string; preview?: Preview }) => {
        if (!alive) return;
        if (!data.success || !data.preview) return setLoadError(data.error || "Could not load the sub packet.");
        setPreview(data.preview);
        setTo((current) => current || data.preview!.to);
      })
      .catch(() => alive && setLoadError("Could not load the sub packet."));
    return () => {
      alive = false;
    };
  }, [open, accountId, lang]);

  // A new opening starts clean (the email is filled in again from the sub).
  useEffect(() => {
    if (open) return;
    setPreview(null);
    setTo("");
    setLang("en");
  }, [open]);

  const emailProblem = !to.trim() ? "Type the sub's email." : !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(to.trim()) ? "That is not an email address." : "";
  const blocking = (preview?.problems ?? []).filter((problem) => !/email/i.test(problem));
  const blocked = !preview || blocking.length > 0 || Boolean(emailProblem);

  async function send() {
    if (blocked) return;
    setSending(true);
    setSendError("");
    try {
      const response = await fetch(`/api/accounts/${encodeURIComponent(accountId)}/sub-packet`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang, to: to.trim() }),
      });
      const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; sentTo?: string };
      if (!response.ok || !data.success) throw new Error(data.error || "The sub packet was not sent. Try again.");
      showToast(`Sub packet sent to ${data.sentTo ?? to.trim()} ✓`);
      onClose();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "The sub packet was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open={open}
      title="Send Sub Packet"
      text={`${accountName}. Check it, then tap Send. Nothing goes out before.`}
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
          {blocking.length ? <ErrorBox title="Not ready to send" text={blocking.join(" ")} /> : null}
          <Field
            label={`To${preview.subName ? ` (${preview.subName})` : ""}`}
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={to}
            onChange={(event) => setTo(event.target.value)}
            placeholder="name@example.com"
            error={emailProblem || undefined}
          />
          <div>
            <p className="ui-label">Language</p>
            <div className="ui-actions-row">
              {SUB_PACKET_LANGS.map((option) => (
                <BigButton key={option.lang} kind={lang === option.lang ? "main" : "second"} aria-pressed={lang === option.lang} onClick={() => setLang(option.lang)} disabled={sending}>
                  {option.label}
                </BigButton>
              ))}
            </div>
            <p className="ui-muted">No language is on file for subs yet, so it starts in English.</p>
          </div>
          <p className="ui-muted">Subject: {preview.subject}. The PDF of the same packet is attached.</p>
          {sendError ? <ErrorBox title="Not sent" text={sendError} /> : null}
          <iframe title="Sub packet preview" srcDoc={preview.html} sandbox="" style={{ width: "100%", height: 480, border: "1px solid #cbd5e1", borderRadius: 12, background: "#ffffff" }} />
        </div>
      ) : null}
    </Sheet>
  );
}
