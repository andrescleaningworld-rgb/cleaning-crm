"use client";

// "📲 Invite to portal" on a sub's page. The share buttons are Crew Link's
// own (app/components/CrewLinkShare.tsx): Text opens the invite on this
// phone, Copy copies it, Print QR opens a printable sheet. Email sends it to
// the sub's email on file (app/api/subcontractors/[id]/invite). Every use is
// recorded, and the last one shows under the button. The words are in
// lib/subPortalInvite.ts. Sub portal login is not touched: subs still log in
// with just their email.
import { useCallback, useEffect, useState } from "react";
import CrewLinkShare, { type ShareMethod } from "@/app/components/CrewLinkShare";
import { BigButton, Sheet, showToast } from "@/app/ui";
import { INVITE_METHOD_LABEL, SUB_PORTAL_PATH, subInviteText, type InviteMethod, type InviteRecord } from "@/lib/subPortalInvite";

function inviteLine(invite: InviteRecord): string {
  const day = new Date(invite.at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `Invited on ${day} by ${invite.by || "someone"} via ${INVITE_METHOD_LABEL[invite.method]}`;
}

export default function InviteToPortal({ subId, subName, email, onEditSub }: { subId: string; subName: string; email: string; onEditSub: () => void }) {
  const [open, setOpen] = useState(false);
  const [invites, setInvites] = useState<InviteRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const api = `/api/subcontractors/${encodeURIComponent(subId)}/invite`;
  const url = typeof window !== "undefined" ? `${window.location.origin}${SUB_PORTAL_PATH}` : "";
  const message = email ? subInviteText(url, email) : "";

  const load = useCallback(async () => {
    try {
      const response = await fetch(api, { cache: "no-store" });
      const data = (await response.json()) as { success?: boolean; invites?: InviteRecord[] };
      if (response.ok && data.success) setInvites(data.invites ?? []);
    } catch {
      // The line under the button is a help, not a must: the button still works.
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  async function record(method: InviteMethod): Promise<void> {
    const response = await fetch(api, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ method }) });
    const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; invites?: InviteRecord[] };
    if (!response.ok || !data.success) throw new Error(data.error || "That did not work. Try again.");
    setInvites(data.invites ?? []);
  }

  function shared(method: ShareMethod) {
    record(method).catch(() => showToast("The invite was shared, but it was not recorded.", "bad"));
  }

  async function sendEmail() {
    setError("");
    setSending(true);
    try {
      await record("email");
      showToast(`Invite emailed to ${email} ✓`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The email was not sent. Try again.");
    } finally {
      setSending(false);
    }
  }

  const last = invites[0];

  return (
    <div className="ui-stack" data-invite-to-portal>
      <BigButton
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        📲 Invite to portal
      </BigButton>
      <p className="ui-muted" data-last-invite>
        {last ? inviteLine(last) : "Not invited from here yet."}
      </p>

      <Sheet open={open} title="Invite to portal" text={`${subName}. They log in with just their email.`} onClose={() => setOpen(false)} closeLabel="Close" busy={sending}>
        {email ? (
          <div className="ui-stack">
            <CrewLinkShare
              placeName={subName}
              url={url}
              message={message}
              copyText={message}
              copyLabel="Copy invite"
              printHref={`/subcontractors/${encodeURIComponent(subId)}/invite-print`}
              printLabel="Print QR"
              qrNote="This opens the portal link on your phone. For the full invite with the login steps, use Copy invite or Email."
              onShare={shared}
            >
              <button
                type="button"
                disabled={sending}
                onClick={() => void sendEmail()}
                className="flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-blue-700 px-4 text-lg font-bold text-white shadow-sm hover:bg-blue-600 disabled:opacity-50"
              >
                <span className="text-2xl" aria-hidden="true">✉️</span> {sending ? "Sending…" : "Email"}
              </button>
            </CrewLinkShare>
            {error ? <p className="ui-field-error">{error}</p> : null}
            <p className="ui-muted">Email goes to {email}.</p>
            <details>
              <summary>See the invite</summary>
              <pre className="ui-card-text" style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", margin: "8px 0 0" }}>
                {message}
              </pre>
            </details>
            {invites.length > 1 ? (
              <details>
                <summary>Earlier invites</summary>
                <ul className="ui-card-text" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  {invites.slice(1, 10).map((invite) => (
                    <li key={`${invite.at}-${invite.method}`}>{inviteLine(invite)}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : (
          <div className="ui-stack">
            <p className="ui-field-error">Add an email for this sub first.</p>
            <p>Subs log in to the portal with their email, so the invite needs one.</p>
            <div>
              <BigButton
                kind="second"
                onClick={() => {
                  setOpen(false);
                  onEditSub();
                }}
              >
                Edit this sub
              </BigButton>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}
