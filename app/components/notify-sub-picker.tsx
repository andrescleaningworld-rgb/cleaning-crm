"use client";

// The manual "Notify sub" / "Notify sub again": how to send it. Big buttons
// in the same look as the other share pickers (Send Sub Packet, the sub
// portal invite, CW Now's crew list: app/components/CrewLinkShare.tsx):
//   Text (SMS)     the same text as the automatic notice, sent by the server
//   Email          the same email as the automatic notice
//   WhatsApp       opens WhatsApp with the message ready, to the sub's phone
//   Copy message   copies the message to paste anywhere
//   Copy complaint link  the complaint in the sub portal (never the staff page)
//   Text + Email   both, exactly like the automatic notice
// The automatic first notice (when a complaint is made) does not use this.
// Every send is written on the complaint (lib/complaintSubNotice.ts); WhatsApp
// and Copy are written as "Opened WhatsApp" / "Copied" (delivery is not known).
// Used by the Complaint Detail page and the Pin Board popup (notify-sub-button.tsx).

import { useEffect, useState } from "react";
import { ErrorBox, Sheet, showToast } from "@/app/ui";
import { whatsappHref } from "@/lib/crewLinkPeople";

type Info = { hasSub: boolean; subName: string; phone: string; email: string; message: string; link: string };
type SendResult = { email: string; text: string; subName: string; reasons: string[] };
type Channels = "text" | "email" | "both";

const BUTTON = "flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl px-4 text-lg font-bold shadow-sm disabled:opacity-50";
const NOTE = "mt-1 text-center text-sm text-slate-500";

async function post(body: Record<string, unknown>) {
  const response = await fetch("/api/complaints", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string; info?: Info; result?: SendResult };
  if (!response.ok || data.success !== true) throw new Error(data.error || "That did not work. Try again.");
  return data;
}

/** complaintKey: the Complaint ID (or row number / internal key) as in /complaints/<key>. */
export default function NotifySubPicker({
  open,
  complaintKey,
  lastNotified,
  onClose,
  onDone,
}: {
  open: boolean;
  complaintKey: string;
  /** "Last notified: …" line, already formatted. "" when never. */
  lastNotified?: string;
  onClose: () => void;
  /** After any send or log: read the list of notices again. `message` is what was done, `bad` when nothing went out. */
  onDone: (message: string, bad?: boolean) => void;
}) {
  const [info, setInfo] = useState<Info | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<Channels | "">("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || !complaintKey) return;
    let alive = true;
    setInfo(null);
    setLoadError("");
    setError("");
    post({ action: "notifySubInfo", complaint: { id: complaintKey } })
      .then((data) => alive && setInfo(data.info ?? null))
      .catch((err: unknown) => alive && setLoadError(err instanceof Error ? err.message : "Could not load the sub."));
    return () => {
      alive = false;
    };
  }, [open, complaintKey]);

  async function send(channels: Channels) {
    setBusy(channels);
    setError("");
    try {
      const data = await post({ action: "notifySub", channels, complaint: { id: complaintKey } });
      const { email, text, subName, reasons } = data.result ?? { email: "", text: "", subName: "", reasons: [] };
      const parts = [email === "sent" ? "email" : "", text === "sent" ? "text" : ""].filter(Boolean);
      const textFailed = channels !== "email" && text === "failed";
      if (textFailed) {
        // Right away, here, so another way can be picked.
        const why = reasons.find((reason) => reason.startsWith("The text was not sent: "))?.slice("The text was not sent: ".length) ?? "";
        setError(`${parts.length > 0 ? "Text failed, try WhatsApp. (The email was sent.)" : "Text failed, try WhatsApp or Email."}${why ? ` Reason: ${why}` : ""}`);
        onDone(parts.length > 0 ? `${subName || "The sub"} was notified by email. The text failed.` : "Text failed, try WhatsApp or Email.", parts.length === 0);
        return;
      }
      if (parts.length > 0) {
        onDone(`${subName || "The sub"} was notified by ${parts.join(" and ")}.${reasons.length ? ` (${reasons.join(" ")})` : ""}`);
        onClose();
      } else {
        const why = `Not sent: ${reasons.join(" ") || "unknown reason."}`;
        setError(why);
        onDone(why, true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The notice was not sent.");
    } finally {
      setBusy("");
    }
  }

  /** WhatsApp / Copy / Copy link: written on the complaint. The message is already out, so a failure only says so. */
  function logged(method: "whatsapp" | "copy" | "link") {
    post({ action: "logSubNotice", method, complaint: { id: complaintKey } })
      .then(() => onDone(method === "whatsapp" ? "WhatsApp opened with the message." : method === "link" ? "Link copied." : "Message copied."))
      .catch(() => showToast("Done, but it was not written on the complaint.", "bad"));
  }

  async function copy(what: "copy" | "link") {
    if (!info) return;
    const text = what === "link" ? info.link : info.message;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      window.prompt("Copy this:", text);
    }
    showToast(what === "link" ? "Link copied ✓" : "Message copied ✓");
    logged(what);
  }

  const noPhone = !info?.phone;
  const noEmail = !info?.email;
  const locked = busy !== "";

  return (
    <Sheet open={open} title="Notify sub" text={lastNotified ? `Last notified: ${lastNotified}. How do you want to send it?` : "How do you want to send it?"} onClose={onClose} closeLabel="Close" busy={locked}>
      {loadError ? <ErrorBox title="Could not load the sub" text={loadError} /> : null}
      {!info && !loadError ? <p className="ui-muted">Loading the sub…</p> : null}
      {info && !info.hasSub ? <ErrorBox title="No sub" text="No sub is set on this complaint's account." /> : null}
      {info && info.hasSub ? (
        <div className="ui-stack">
          <div className="ui-card-text">
            <p className="ui-strong">{info.subName || "The sub"}</p>
            <p>📱 {info.phone || "No phone on file"}</p>
            <p>✉️ {info.email || "No email on file"}</p>
          </div>
          {error ? <ErrorBox title="Not sent" text={error} /> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <button type="button" disabled={noPhone || locked} onClick={() => void send("text")} className={`${BUTTON} bg-green-600 text-white hover:bg-green-500`}>
                <span className="text-2xl" aria-hidden="true">💬</span> {busy === "text" ? "Sending…" : "Text (SMS)"}
              </button>
              {noPhone ? <p className={NOTE}>No phone on file</p> : null}
            </div>
            <div>
              <button type="button" disabled={noEmail || locked} onClick={() => void send("email")} className={`${BUTTON} bg-blue-700 text-white hover:bg-blue-600`}>
                <span className="text-2xl" aria-hidden="true">✉️</span> {busy === "email" ? "Sending…" : "Email"}
              </button>
              {noEmail ? <p className={NOTE}>No email on file</p> : null}
            </div>
            <div>
              {noPhone ? (
                <button type="button" disabled className={`${BUTTON} bg-emerald-700 text-white`}>
                  <span className="text-2xl" aria-hidden="true">🟢</span> WhatsApp
                </button>
              ) : (
                <a
                  href={whatsappHref(info.phone, info.message)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-disabled={locked}
                  onClick={() => logged("whatsapp")}
                  className={`${BUTTON} bg-emerald-700 text-white hover:bg-emerald-600`}
                >
                  <span className="text-2xl" aria-hidden="true">🟢</span> WhatsApp
                </a>
              )}
              {noPhone ? <p className={NOTE}>No phone on file</p> : null}
            </div>
            <div>
              <button type="button" disabled={locked} onClick={() => void copy("copy")} className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
                <span className="text-2xl" aria-hidden="true">📋</span> Copy message
              </button>
            </div>
            <div className="sm:col-span-2">
              {/* The complaint in the sub portal (what the sub sees), never the staff page. */}
              <button type="button" disabled={locked || !info.link} onClick={() => void copy("link")} className={`${BUTTON} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`}>
                <span className="text-2xl" aria-hidden="true">🔗</span> Copy complaint link
              </button>
              <p className={NOTE}>Opens this complaint in the sub portal.</p>
            </div>
          </div>
          <div>
            <button type="button" disabled={noPhone || noEmail || locked} onClick={() => void send("both")} className={`${BUTTON} bg-slate-800 text-white hover:bg-slate-700`}>
              <span className="text-2xl" aria-hidden="true">📨</span> {busy === "both" ? "Sending…" : "Text + Email"}
            </button>
            {noPhone && noEmail ? <p className={NOTE}>No phone or email on file</p> : noPhone ? <p className={NOTE}>No phone on file</p> : noEmail ? <p className={NOTE}>No email on file</p> : null}
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
