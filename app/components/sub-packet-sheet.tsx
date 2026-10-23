"use client";

// "Send Sub Packet" (account page): the language (English / Español /
// Português), then how to send it, with the same buttons as the sub portal
// invite (app/components/CrewLinkShare.tsx):
//   Text       opens Messages on this phone with a short message and the link
//              (on a computer it shows the QR code, as the invite does)
//   Copy link  copies the packet link
//   Show QR    shows a QR code of the packet link
//   Email      the packet email as before: who it goes to (editable), the
//              subject, and Send. Nothing goes out until Send.
// The link opens the packet with no login (lib/subPacketLink.ts). Each way it
// is shared is written to the account's History. The packet itself is shown
// below, exactly as the sub will see it.
// Server: app/api/accounts/[id]/sub-packet.

import { useEffect, useState } from "react";
import CrewLinkShare from "@/app/components/CrewLinkShare";
import { BigButton, ErrorBox, Field, Sheet, showToast } from "@/app/ui";
import { SUB_PACKET_LANGS, type SubPacketLang } from "@/lib/subPacket";
import { subPacketShareText, type PacketShareMethod } from "@/lib/subPacketShare";

type Preview = { to: string; subName: string; subject: string; html: string; lang: SubPacketLang; problems: string[]; link: string };

export default function SubPacketSheet({ open, accountId, accountName, onClose }: { open: boolean; accountId: string; accountName: string; onClose: () => void }) {
  const [lang, setLang] = useState<SubPacketLang>("en");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [to, setTo] = useState("");
  const [loadError, setLoadError] = useState("");
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const api = `/api/accounts/${encodeURIComponent(accountId)}/sub-packet`;

  // Each opening (and each language) reads the account fresh.
  useEffect(() => {
    if (!open || !accountId) return;
    let alive = true;
    setLoadError("");
    setSendError("");
    fetch(`${api}?lang=${lang}`, { cache: "no-store" })
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
  }, [open, accountId, lang, api]);

  // A new opening starts clean (the email is filled in again from the sub).
  useEffect(() => {
    if (open) return;
    setPreview(null);
    setTo("");
    setLang("en");
    setEmailOpen(false);
  }, [open]);

  const emailProblem = !to.trim() ? "Type the sub's email." : !/^[^@\s,;]+@[^@\s,;]+\.[^@\s,;]+$/.test(to.trim()) ? "That is not an email address." : "";
  const blocking = (preview?.problems ?? []).filter((problem) => !/email/i.test(problem));
  const linkReady = Boolean(preview?.link) && blocking.length === 0;
  const blocked = !preview || blocking.length > 0 || Boolean(emailProblem);

  /** Text / Copy link / QR: written to the History. The link is already out, so a failure here only says so. */
  function shared(method: Exclude<PacketShareMethod, "email">) {
    fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lang, method }) })
      .then((response) => response.json().then((data: { success?: boolean }) => (response.ok && data.success ? undefined : Promise.reject())))
      .catch(() => showToast("The packet was shared, but it was not recorded.", "bad"));
  }

  async function send() {
    if (blocked) return;
    setSending(true);
    setSendError("");
    try {
      const response = await fetch(api, {
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
      text={`${accountName}. Pick the language, then how to send it.`}
      onClose={onClose}
      closeLabel={emailOpen ? undefined : "Close"}
      busy={sending}
      actions={
        emailOpen ? (
          <BigButton busy={sending} busyLabel="Sending…" disabled={blocked} onClick={() => void send()}>
            Send email
          </BigButton>
        ) : undefined
      }
    >
      {loadError ? <ErrorBox title="Could not load the packet" text={loadError} /> : null}
      {!preview && !loadError ? <p className="ui-muted">Loading the packet…</p> : null}
      {preview ? (
        <div className="ui-stack">
          {blocking.length ? <ErrorBox title="Not ready to send" text={blocking.join(" ")} /> : null}
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

          {linkReady ? (
            <>
              <CrewLinkShare
                placeName={accountName}
                url={preview.link}
                message={subPacketShareText(accountName, preview.link)}
                copyLabel="Copy link"
                qrButtonLabel="Show QR"
                qrNote="The sub scans this with their phone's camera to open the packet."
                onShare={(method) => {
                  if (method === "text" || method === "copy") shared(method);
                }}
                onQr={() => shared("qr")}
              >
                <button
                  type="button"
                  aria-expanded={emailOpen}
                  onClick={() => setEmailOpen((prev) => !prev)}
                  className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-700 px-4 text-lg font-bold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
                >
                  <span className="text-2xl" aria-hidden="true">✉️</span> Email
                </button>
              </CrewLinkShare>
              <p className="ui-muted">The link opens the packet with no login. It works for 90 days, and stops if this account gets another sub.</p>
            </>
          ) : null}

          {emailOpen ? (
            <>
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
              <p className="ui-muted">Subject: {preview.subject}. The PDF of the same packet is attached.</p>
              {sendError ? <ErrorBox title="Not sent" text={sendError} /> : null}
            </>
          ) : null}

          <iframe title="Sub packet preview" srcDoc={preview.html} sandbox="" style={{ width: "100%", height: 480, border: "1px solid #cbd5e1", borderRadius: 12, background: "#ffffff" }} />
        </div>
      ) : null}
    </Sheet>
  );
}
