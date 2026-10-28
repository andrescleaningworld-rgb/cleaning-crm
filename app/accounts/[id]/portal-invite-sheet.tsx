"use client";

// Account page -> "Invite to portal". Nothing goes out by itself:
//   1. The invite as the customer will get it: the email (subject and the
//      email itself, with the real names and this invite's link) and the
//      short text. English / Español switches both.
//   2. "Change the wording" for this one invite (the template stays the same).
//   3. Share: Email (to the account's email, or another address typed here),
//      Text (opens Messages with the short text), Copy (the short text with
//      the link), QR code (to show on site). The share buttons are the sub
//      portal invite's (app/components/CrewLinkShare.tsx).
// Every share is a line in the account's History; the page shows the last
// one ("Invited Oct 28 by Greg"). Server: app/api/admin/portal-invite.

import { useEffect, useMemo, useState } from "react";
import CrewLinkShare, { type ShareMethod } from "@/app/components/CrewLinkShare";
import { BigButton, ErrorBox, Field, Sheet, TextAreaField, showToast } from "@/app/ui";
import { BUTTON_LINE, portalInviteDraft, renderPortalInvite, type InviteDraft, type InviteLang } from "@/lib/portalInviteEmail";

type Fill = { customerName: string; accountName: string; managerName: string; managerPhone: string };
type Prepared = { url: string; email: string; fill: Fill; testOnly: boolean };
export type PortalInviteRecord = { at: string; by: string; how: string };

async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch("/api/admin/portal-invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || data.success !== true) throw new Error(typeof data.error === "string" ? data.error : "That did not work. Try again.");
  return data;
}

/** "Invited Oct 28 by Greg" (the latest invite), for the account page. */
export function invitedLine(invite: PortalInviteRecord | undefined): string {
  if (!invite) return "";
  const day = new Date(invite.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `Invited ${day} by ${invite.by || "someone"}`;
}

export default function PortalInviteSheet({
  open,
  accountId,
  accountName,
  onClose,
  onInvited,
}: {
  open: boolean;
  accountId: string;
  accountName: string;
  onClose: () => void;
  /** After a share: the latest invites (the page shows the first). */
  onInvited: (invites: PortalInviteRecord[]) => void;
}) {
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [error, setError] = useState("");
  const [lang, setLang] = useState<InviteLang>("en");
  // Each language keeps its own words, changed or not.
  const [drafts, setDrafts] = useState<Partial<Record<InviteLang, InviteDraft>>>({});
  const [editing, setEditing] = useState(false);
  const [to, setTo] = useState("");
  const [sending, setSending] = useState(false);

  // Each opening makes a fresh invite (and its own one-time link).
  useEffect(() => {
    if (!open) return;
    let alive = true;
    setPrepared(null);
    setError("");
    setLang("en");
    setDrafts({});
    setEditing(false);
    post({ action: "prepare", accountId })
      .then((data) => {
        if (!alive) return;
        const ready = data as unknown as Prepared;
        setPrepared(ready);
        setTo(ready.email);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "The invite could not be made.");
      });
    return () => {
      alive = false;
    };
  }, [open, accountId]);

  const template = (which: InviteLang): InviteDraft | null => (prepared ? portalInviteDraft({ ...prepared.fill, url: prepared.url, lang: which }) : null);
  const draft: InviteDraft | null = drafts[lang] ?? template(lang);
  const changed = Boolean(drafts[lang]);
  const preview = useMemo(() => (prepared && draft ? renderPortalInvite({ subject: draft.subject, body: draft.body, url: prepared.url, lang }) : null), [prepared, draft, lang]);

  const edit = (patch: Partial<InviteDraft>) => {
    if (!draft) return;
    setDrafts((current) => ({ ...current, [lang]: { ...draft, ...patch } }));
  };

  async function record(method: "text" | "copy" | "qr") {
    try {
      const data = await post({ action: "record", accountId, method, lang });
      onInvited((data.invites as PortalInviteRecord[]) ?? []);
    } catch {
      showToast("The invite was shared, but it was not written in History.", "bad");
    }
  }

  async function sendEmail() {
    if (!prepared || !draft) return;
    setSending(true);
    setError("");
    try {
      const data = await post({ action: "email", accountId, url: prepared.url, to, lang, subject: draft.subject, body: draft.body });
      onInvited((data.invites as PortalInviteRecord[]) ?? []);
      showToast(`Invite emailed to ${to.trim()} ✓`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The email was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  const langButton = (value: InviteLang, label: string) => (
    <button
      type="button"
      aria-pressed={lang === value}
      onClick={() => setLang(value)}
      className={`min-h-[48px] flex-1 rounded-xl px-4 text-lg font-bold ${lang === value ? "bg-blue-700 text-white" : "bg-white text-slate-800 ring-1 ring-slate-300"}`}
    >
      {label}
    </button>
  );

  return (
    <Sheet open={open} title="Invite to portal" text={`${accountName}. Check the invite, then pick how to send it.`} onClose={onClose} closeLabel="Close" busy={sending}>
      <div className="ui-stack">
        {error && !prepared ? <ErrorBox title="The invite could not be made" text={error} /> : null}
        {!prepared && !error ? <p className="ui-muted">Getting the invite ready…</p> : null}

        {prepared && draft && preview ? (
          <>
            <div className="flex gap-2" role="group" aria-label="Language">
              {langButton("en", "English")}
              {langButton("es", "Español")}
            </div>

            {/* 1. What the customer gets. */}
            <p className="ui-strong">The email</p>
            <p className="ui-card-text">
              <span className="ui-muted">Subject:</span> {preview.subject}
            </p>
            <iframe title="The invite email" srcDoc={preview.html} sandbox="" style={{ width: "100%", height: 560, border: "1px solid #dbeafe", borderRadius: 12, background: "#ffffff" }} />
            <p className="ui-strong">The text message</p>
            <p className="ui-card-text" style={{ whiteSpace: "pre-wrap", background: "#f1f5f9", borderRadius: 12, padding: 12 }}>
              {draft.short}
            </p>
            {prepared.testOnly ? <p className="ui-muted">Test account: this invite is only for testing.</p> : null}

            {/* 2. Change the words of this one invite. */}
            {editing ? (
              <div className="ui-stack" style={{ border: "1px solid #cbd5e1", borderRadius: 12, padding: 12 }}>
                <Field label="Email subject" maxLength={200} value={draft.subject} onChange={(event) => edit({ subject: event.target.value })} />
                <TextAreaField
                  label="Email message"
                  hint={`A blank line starts a new paragraph. Lines that start with "- " make a list. The line ${BUTTON_LINE[lang]} is where the button goes.`}
                  rows={14}
                  value={draft.body}
                  onChange={(event) => edit({ body: event.target.value })}
                />
                <TextAreaField label="Text message" hint="Keep the link in it: it is how they get in." rows={4} value={draft.short} onChange={(event) => edit({ short: event.target.value })} />
                {draft.short && !draft.short.includes(prepared.url) ? <p className="ui-field-error">The text message has no link. Add it back, or tap Back to the template.</p> : null}
                <div className="ui-actions-row">
                  <BigButton kind="second" onClick={() => setEditing(false)}>
                    Done changing
                  </BigButton>
                  {changed ? (
                    <BigButton
                      kind="quiet"
                      onClick={() =>
                        setDrafts((current) => {
                          const next = { ...current };
                          delete next[lang];
                          return next;
                        })
                      }
                    >
                      Back to the template
                    </BigButton>
                  ) : null}
                </div>
              </div>
            ) : (
              <BigButton kind="second" onClick={() => setEditing(true)}>
                ✏️ Change the wording{changed ? " (changed)" : ""}
              </BigButton>
            )}

            {/* 3. How to send it. */}
            <p className="ui-strong">Send it</p>
            <Field label="Email to" type="email" inputMode="email" value={to} onChange={(event) => setTo(event.target.value)} hint={to.trim().toLowerCase() !== prepared.email.toLowerCase() ? `Their portal login is still ${prepared.email}.` : "The account's email: they log in with it."} />
            <CrewLinkShare
              placeName={accountName}
              url={prepared.url}
              message={draft.short}
              copyText={draft.short.includes(prepared.url) ? draft.short : `${draft.short}\n${prepared.url}`}
              copyLabel="Copy"
              qrButtonLabel="QR code"
              qrNote="Let the customer scan this with their phone's camera. It opens their portal to choose a password."
              onQr={() => void record("qr")}
              onShare={(method: ShareMethod) => {
                if (method === "text" || method === "copy") void record(method);
              }}
            >
              <button
                type="button"
                disabled={sending || !to.trim()}
                onClick={() => void sendEmail()}
                className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-700 px-4 text-lg font-bold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
              >
                <span className="text-2xl" aria-hidden="true">✉️</span> {sending ? "Sending…" : "Email"}
              </button>
            </CrewLinkShare>
            {error ? <p className="ui-field-error">{error}</p> : null}
            <p className="ui-muted">This link works for 7 days.</p>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
